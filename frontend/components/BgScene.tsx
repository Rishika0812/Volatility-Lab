"use client";
/** Persistent, decorative 3D backdrop (no data values shown). Drifting particles + undulating wire grid. */
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Field() {
  const pts = useRef<THREE.Points>(null!), grid = useRef<THREE.Mesh>(null!);
  const geo = useMemo(() => { const n = 700, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const s = (k: number) => { const x = Math.sin(i * k) * 43758.5453; return x - Math.floor(x) - 0.5; }; a.set([s(12.9) * 60, s(78.2) * 30, s(37.7) * 60], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(a, 3)); return g; }, []);
  const plane = useMemo(() => new THREE.PlaneGeometry(90, 90, 60, 60), []);
  const base = useMemo(() => Float32Array.from(plane.attributes.position.array as Float32Array), [plane]);
  useFrame((s) => {
    if (!pts.current || !plane?.attributes?.position) return;
    const t = s.clock.elapsedTime;
    pts.current.rotation.y = t * 0.012;
    pts.current.position.y = Math.sin(t * 0.2) * 0.4;
    const p = plane.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 1) p.setZ(i, Math.sin(base[i * 3] * 0.25 + t * 0.5) * 0.9 + Math.cos(base[i * 3 + 1] * 0.22 + t * 0.4) * 0.9);
    p.needsUpdate = true;
  });
  return (<>
    <points ref={pts} geometry={geo}><pointsMaterial color="#7b8cff" size={0.12} transparent opacity={0.55} depthWrite={false} /></points>
    <mesh ref={grid} geometry={plane} rotation={[-Math.PI / 2.2, 0, 0]} position={[0, -12, -10]}><meshBasicMaterial wireframe color="#3a4cff" transparent opacity={0.18} /></mesh>
  </>);
}
export default function BgScene() {
  return (<div className="pointer-events-none fixed inset-0 -z-10"><Canvas dpr={1} camera={{ position: [0, 2, 24], fov: 55 }} gl={{ antialias: false, powerPreference: "low-power" }}><Field /></Canvas></div>);
}
