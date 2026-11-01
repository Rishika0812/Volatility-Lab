"use client";
/**
 * Split-screen 3D shock lab. LEFT: +k sd shock, RIGHT: -k sd shock.
 * Surface = EGARCH conditional volatility (x: days after shock, z: shock size 0..5 sd) from the backend simulation of the ESTIMATED parameters.
 * Ribbons: GARCH (blue) vs EGARCH (violet) volatility path for the selected shock. Particles speed/size scale with the day-1 variance change.
 */
import Fx from "./Fx";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

type Sim = any;
const H = 7;

function Side({ sim, sign, scale, xoff }: { sim: Sim; sign: 1 | -1; scale: number; xoff: number }) {
  const key = sign > 0 ? "egarch_positive" : "egarch_negative";
  const S: number[][] = sim.surface[key], ks: number[] = sim.surface.ks;
  const nh = Math.min(S[0].length, 40), nk = ks.length;
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(12, 8, nh - 1, nk - 1);
    const col = new Float32Array(g.attributes.position.count * 3);
    const a = new THREE.Color("#2a4bd8"), b = new THREE.Color(sign > 0 ? "#2fd18b" : "#d1566b");
    for (let ik = 0; ik < nk; ik++) for (let ih = 0; ih < nh; ih++) {
      const v = S[ik][ih] * scale / H, i = ik * nh + ih; g.attributes.position.setZ(i, S[ik][ih] * scale);
      const c = a.clone().lerp(b, Math.min(1, v * 1.2)); col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  }, [sim, sign, scale]); // eslint-disable-line
  const path = sim.egarch[sign > 0 ? "positive" : "negative"].vol.slice(0, nh) as number[];
  const gpath = sim.garch.positive.vol.slice(0, nh) as number[];
  const zSel = ((sim.k / ks[ks.length - 1]) - 0.5) * 8;                       // selected shock row on the surface
  const toPts = (v: number[]) => v.map((y, i) => new THREE.Vector3((i / (nh - 1) - 0.5) * 12, y * scale + 0.06, 0).setZ(zSel).setY(y * scale + 0.06));
  const N = 260, pts = useRef<THREE.Points>(null!);
  const pos = useMemo(() => new Float32Array(N * 3), []);
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ o: (Math.sin(i * 91.7) * 0.5 + 0.5), a: i * 2.399 })), []);
  const intensity = Math.abs(sim.impact_day1[sign > 0 ? "egarch_pos_pct_var" : "egarch_neg_pct_var"]) / 100 + 0.2;
  useFrame((s) => {
    if (!pts.current?.geometry?.attributes?.position) return;
    const t = s.clock.elapsedTime;
    seeds.forEach((q, i) => {
      const life = (t * (0.15 + intensity * 0.5) + q.o) % 1;
      const r = life * 7 * (0.4 + intensity);
      pos[i * 3] = -6 + life * 12; pos[i * 3 + 1] = 0.3 + Math.sin(q.a) * r * 0.25 + path[0] * scale * (1 - life); pos[i * 3 + 2] = zSel + Math.cos(q.a) * r * 0.35;
    });
    (pts.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });
  return (<group position={[xoff, -2, 0]}>
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]}><meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.5} metalness={0.2} /></mesh>
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><meshBasicMaterial wireframe color="#8aa5ff" transparent opacity={0.16} /></mesh>
    <Line points={toPts(gpath)} color="#4f8bff" lineWidth={3} />
    <Line points={toPts(path)} color={sign > 0 ? "#2fd18b" : "#ff6b86"} lineWidth={3.5} />
    <points ref={pts}><bufferGeometry><bufferAttribute attach="attributes-position" array={pos} count={N} itemSize={3} /></bufferGeometry>
      <pointsMaterial color={sign > 0 ? "#7dffc4" : "#ff8aa0"} size={0.09} transparent opacity={0.8} depthWrite={false} /></points>
    <Html position={[0, 5.6, -4]} center><div className={`whitespace-nowrap rounded-md border px-3 py-1 text-xs ${sign > 0 ? "border-bull/60 text-bull" : "border-bear/60 text-bear"} bg-black/70`}>
      {sign > 0 ? "POSITIVE SHOCK" : "NEGATIVE SHOCK"} {sign > 0 ? "+" : "−"}{sim.k.toFixed(1)} sd</div></Html>
  </group>);
}

export default function ShockLab3D({ sim, enabled = true }: { sim: Sim; enabled?: boolean }) {
  const scale = useMemo(() => 5 / Math.max(...sim.surface.egarch_negative.flat(), ...sim.surface.egarch_positive.flat()), [sim]);
  return (<Canvas dpr={[1, 1.5]} camera={{ position: [0, 9, 20], fov: 46 }}>
    <color attach="background" args={["#060d24"]} /><ambientLight intensity={0.5} /><directionalLight position={[6, 14, 8]} intensity={1} />
    <Side sim={sim} sign={1} scale={scale} xoff={-8} /><Side sim={sim} sign={-1} scale={scale} xoff={8} />
    <gridHelper args={[40, 40, "#2a3a6a", "#16213f"]} position={[0, -2.02, 0]} />
    <Fx /><OrbitControls enabled={enabled} enablePan={false} minDistance={10} maxDistance={34} maxPolarAngle={Math.PI * 0.49} />
  </Canvas>);
}
