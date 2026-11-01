"use client";
/**
 * Hero scene. Every geometric input comes from the uploaded Nifty 50 data (computed by the backend):
 *  - Terrain height  = rolling realised volatility (windows 5..120d) across 128 dates 2015-2025.
 *  - Particles       = each daily log return (x = date, y = return, green >= 0 / red < 0).
 *  - Core + lighting = react to rolling volatility at the moving "playhead" date.
 * Only the gentle wave motion is decorative.
 */
import Fx from "./Fx";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Terrain = { windows: number[]; dates: string[]; values: number[][] };
type Row = { date: string; close: number; ret: number | null; rv30: number | null };
export type Hud = { date: string; close: number; vol: number | null };

const W = 40, D = 16;

function Scene({ terrain, rows, onHud, enabled }: { terrain: Terrain; rows: Row[]; onHud: (h: Hud) => void; enabled: boolean }) {
  const nx = terrain.dates.length, ny = terrain.windows.length;
  const maxV = useMemo(() => Math.max(...terrain.values.flat()), [terrain]);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, D, nx - 1, ny - 1);
    const col = new Float32Array(g.attributes.position.count * 3);
    const c1 = new THREE.Color("#1a3aa8"), c2 = new THREE.Color("#9b5cff"), c3 = new THREE.Color("#d1566b");
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const v = terrain.values[iy][ix] / maxV, i = iy * nx + ix;
      const c = v < 0.5 ? c1.clone().lerp(c2, v * 2) : c2.clone().lerp(c3, (v - 0.5) * 2);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [terrain, nx, ny, maxV]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const hOf = (ix: number, iy: number) => (terrain.values[iy][ix] / maxV) * 6.5;
  useEffect(() => { // static displacement from real data
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) p.setZ(iy * nx + ix, hOf(ix, iy));
    p.needsUpdate = true; geo.computeVertexNormals();
  }, [geo]); // eslint-disable-line

  // particles from real returns
  const pts = useMemo(() => {
    const r = rows.filter((x) => x.ret !== null);
    const pos = new Float32Array(r.length * 3), col = new Float32Array(r.length * 3);
    r.forEach((x, i) => {
      const t = i / (r.length - 1);
      const seed = Math.sin(i * 12.9898) * 43758.5453; const z = (seed - Math.floor(seed) - 0.5) * D;   // deterministic scatter in depth (decorative axis)
      pos.set([(t - 0.5) * W, 8 + (x.ret as number) * 0.55, z], i * 3);
      const c = new THREE.Color((x.ret as number) >= 0 ? "#2fd18b" : "#d1566b"); col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g;
  }, [rows]);

  const head = useRef<THREE.Mesh>(null!), core = useRef<THREE.Mesh>(null!), light = useRef<THREE.PointLight>(null!), ptsRef = useRef<THREE.Points>(null!), shell = useRef<THREE.Mesh>(null!);
  const tAcc = useRef(0), last = useRef(0);
  const maxRv = useMemo(() => Math.max(...rows.map((r) => r.rv30 ?? 0)), [rows]);

  useFrame((s, dt) => {
    if (!head.current || !core.current || !light.current || !ptsRef.current || !shell.current || !rows.length) return;
    tAcc.current += dt;
    const t = s.clock.elapsedTime;
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, hOf(i % nx, Math.floor(i / nx)) + Math.sin(base[i * 3] * 0.6 + t * 1.2) * 0.12 + Math.cos(base[i * 3 + 1] * 0.8 + t) * 0.08);
    p.needsUpdate = true;
    const prog = ((t * 0.04) % 1);
    const idx = Math.min(rows.length - 1, Math.floor(prog * rows.length));
    const rv = rows[idx].rv30 ?? 0, vn = maxRv ? rv / maxRv : 0;
    head.current.position.x = (prog - 0.5) * W;
    const m = head.current.material as THREE.MeshBasicMaterial; m.opacity = 0.25 + vn * 0.5; m.color.set(vn > 0.5 ? "#d1566b" : "#5b8cff");
    core.current.rotation.y = t * 0.4; core.current.rotation.x = t * 0.2;
    const sc = 1.6 + vn * 1.4 + Math.sin(t * 2) * 0.05; core.current.scale.setScalar(sc); shell.current.scale.setScalar(sc * 1.35);
    (core.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8 + vn * 2.2;
    light.current.intensity = 60 + vn * 260; light.current.color.set(vn > 0.45 ? "#ff6b86" : "#6a8dff");
    ptsRef.current.rotation.y = Math.sin(t * 0.1) * 0.03;
    if (t - last.current > 0.12) { last.current = t; onHud({ date: rows[idx].date, close: rows[idx].close, vol: rows[idx].rv30 }); }
  });
  return (<>
    <color attach="background" args={["#050b1f"]} /><fog attach="fog" args={["#050b1f", 30, 70]} />
    <ambientLight intensity={0.35} /><directionalLight position={[10, 20, 8]} intensity={0.8} color="#9bb4ff" />
    <pointLight ref={light} position={[0, 9, 0]} distance={50} decay={1.6} />
    <group position={[0, -3, 0]}>
      <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]}><meshStandardMaterial vertexColors roughness={0.55} metalness={0.25} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><meshBasicMaterial wireframe color="#7fa0ff" transparent opacity={0.13} /></mesh>
      <mesh ref={head} position={[0, 3.5, 0]}><boxGeometry args={[0.08, 8, D]} /><meshBasicMaterial transparent opacity={0.4} /></mesh>
      <points ref={ptsRef} geometry={pts}><pointsMaterial vertexColors size={0.11} sizeAttenuation transparent opacity={0.85} depthWrite={false} /></points>
      <group position={[0, 10, 0]}>
        <mesh ref={core}><icosahedronGeometry args={[1, 2]} /><meshStandardMaterial color="#1b2a6b" emissive="#5b6cff" emissiveIntensity={1.2} roughness={0.2} metalness={0.6} /></mesh>
        <mesh ref={shell}><icosahedronGeometry args={[1, 1]} /><meshBasicMaterial wireframe color="#b79cff" transparent opacity={0.35} /></mesh>
      </group>
    </group>
    <Fx /><OrbitControls enabled={enabled} enablePan={false} minDistance={14} maxDistance={42} maxPolarAngle={Math.PI * 0.49} autoRotate autoRotateSpeed={0.35} />
  </>);
}

export default function Hero3D(props: { terrain: Terrain; rows: Row[]; onHud: (h: Hud) => void; enabled?: boolean }) {
  return (<Canvas dpr={[1, 1.6]} camera={{ position: [0, 12, 26], fov: 48 }} gl={{ antialias: true, powerPreference: "high-performance" }}>
    <Scene {...props} enabled={props.enabled ?? true} /></Canvas>);
}
