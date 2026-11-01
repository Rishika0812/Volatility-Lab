"use client";
/** Three data-driven 3D views for the Analysis Studio. */
import Fx from "./Fx";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const Stage = ({ children, enabled = true, cam = [14, 11, 16] as [number, number, number] }: { children: React.ReactNode; enabled?: boolean; cam?: [number, number, number] }) => (
  <Canvas dpr={[1, 1.5]} camera={{ position: cam, fov: 45 }}><color attach="background" args={["#03060f"]} /><ambientLight intensity={0.55} /><directionalLight position={[8, 14, 6]} intensity={1.1} />
    {children}<Fx /><OrbitControls enabled={enabled} enablePan={false} minDistance={8} maxDistance={40} maxPolarAngle={Math.PI * 0.495} autoRotate autoRotateSpeed={0.5} /></Canvas>);
const Lbl = ({ p, t, c = "#9fb0e0" }: { p: [number, number, number]; t: string; c?: string }) => <Html position={p} center><div style={{ color: c }} className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px]">{t}</div></Html>;

/** 1) News-impact surface: next-day variance vs shock z and prior-vol state (from ESTIMATED parameters). */
export function NicSurface3D({ S, mode, enabled }: { S: any; mode: "garch" | "egarch" | "diff"; enabled?: boolean }) {
  const nz = S.z.length, nm = S.m.length;
  const vals = useMemo(() => S.m.map((_: number, i: number) => S.z.map((_: number, j: number) => mode === "garch" ? S.garch[i][j] : mode === "egarch" ? S.egarch[i][j] : S.egarch[i][j] - S.garch[i][j])), [S, mode]);
  const { geo, max, min } = useMemo(() => {
    const flat: number[] = vals.flat(); const mx = Math.max(...flat), mn = Math.min(...flat); const g = new THREE.PlaneGeometry(14, 10, nz - 1, nm - 1);
    const col = new Float32Array(g.attributes.position.count * 3); const lo = new THREE.Color("#2a4bd8"), mid = new THREE.Color("#9b5cff"), hi = new THREE.Color("#ff5b7a");
    for (let i = 0; i < nm; i++) for (let j = 0; j < nz; j++) {
      const k = i * nz + j, v = (vals[i][j] - mn) / (mx - mn || 1); g.attributes.position.setZ(k, v * 6);
      const c = v < 0.5 ? lo.clone().lerp(mid, v * 2) : mid.clone().lerp(hi, (v - 0.5) * 2); col.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return { geo: g, max: mx, min: mn };
  }, [vals, nz, nm]);
  return (<Stage enabled={enabled}><group position={[0, -2, 0]}>
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]}><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.45} metalness={0.2} /></mesh>
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><meshBasicMaterial wireframe color="#9fb4ff" transparent opacity={0.15} /></mesh>
    <Lbl p={[-7.5, 0, 0]} t="z = −4 (negative shock)" c="#ff8aa0" /><Lbl p={[7.5, 0, 0]} t="z = +4 (positive shock)" c="#7dffc4" /><Lbl p={[0, 0, 5.8]} t="high prior volatility →" /><Lbl p={[0, 0, -5.8]} t="low prior volatility" />
    <Lbl p={[0, 7, 0]} t={`variance ${min.toFixed(2)} → ${max.toFixed(2)} %²`} c="#fff" /></group><gridHelper args={[30, 30, "#1c2a5a", "#0e1633"]} position={[0, -2.02, 0]} /></Stage>);
}

/** 2) Monthly realised volatility: year × month 3D bars from daily log returns (descriptive). */
function MonthlyVolBars({ cells, years, max }: { cells: { y: number; m: number; v: number }[]; years: number[]; max: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current || !cells.length) return;
    const o = new THREE.Object3D(), col = new THREE.Color();
    const a = new THREE.Color("#2a4bd8"), b = new THREE.Color("#ff4d6d");
    cells.forEach((c, i) => {
      const h = Math.max(0.05, (c.v / (max || 1)) * 7);
      o.position.set((c.m - 5.5) * 1.15, h / 2, (years.indexOf(c.y) - years.length / 2) * 1.15);
      o.scale.set(0.9, h, 0.9);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      ref.current!.setColorAt(i, col.copy(a).lerp(b, c.v / (max || 1)));
    });
    if (ref.current.instanceMatrix) ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [cells, years, max]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cells.length]}>
      <boxGeometry />
      <meshStandardMaterial roughness={0.35} metalness={0.3} />
    </instancedMesh>
  );
}

export function MonthlyVol3D({ cells, years, enabled }: { cells: { y: number; m: number; v: number }[]; years: number[]; enabled?: boolean }) {
  const max = useMemo(() => (cells && cells.length ? Math.max(...cells.map((c) => c.v)) : 1), [cells]);
  if (!cells || !cells.length || !years || !years.length) return null;
  return (
    <Stage enabled={enabled} cam={[13, 11, 15]}>
      <group position={[0, -1.5, 0]}>
        <MonthlyVolBars cells={cells} years={years} max={max} />
        {years.map((y, i) => <Lbl key={y} p={[-8, 0.2, (i - years.length / 2) * 1.15]} t={String(y)} />)}
        {["Jan", "Mar", "May", "Jul", "Sep", "Nov"].map((n, i) => <Lbl key={n} p={[(i * 2 - 5.5) * 1.15, 0.2, years.length / 2 * 1.15 + 0.8]} t={n} />)}
      </group>
      <gridHelper args={[30, 30, "#1c2a5a", "#0e1633"]} position={[0, -1.5, 0]} />
    </Stage>
  );
}

/** 3) Return cloud: x = date, y = return(t), z = |return(t+1)|. Colour = sign of return(t). */
export function ReturnCloud3D({ rows, enabled }: { rows: { date: string; ret: number }[]; enabled?: boolean }) {
  const geo = useMemo(() => {
    const n = rows.length - 1, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), up = new THREE.Color("#2fd18b"), dn = new THREE.Color("#ff5b7a");
    for (let i = 0; i < n; i++) { pos.set([(i / n - 0.5) * 18, rows[i].ret * 0.7, Math.abs(rows[i + 1].ret) * 1.1 - 3], i * 3); const c = rows[i].ret >= 0 ? up : dn; col.set([c.r, c.g, c.b], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); return g;
  }, [rows]);
  return (<Stage enabled={enabled} cam={[0, 9, 22]}><points geometry={geo}><pointsMaterial vertexColors size={0.13} sizeAttenuation transparent opacity={0.9} depthWrite={false} /></points>
    <gridHelper args={[30, 30, "#1c2a5a", "#0e1633"]} position={[0, 0, 0]} /><Lbl p={[-9.5, 0.2, -3]} t="2015" /><Lbl p={[9.5, 0.2, -3]} t="2025" /><Lbl p={[0, 7, -3]} t="return(t) ↑" /><Lbl p={[0, 0.3, 6]} t="|return(t+1)| depth →" /></Stage>);
}
