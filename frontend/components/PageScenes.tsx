"use client";
/**
 * Per-page 3D hero scenes. Each is built from the actual pipeline outputs (results.json / series.json):
 * heights, colours and labels are data values; only camera drift, sparkles and glow are decorative.
 */
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, Sparkles } from "@react-three/drei";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Fx from "./Fx";
import { useData } from "@/lib/api";

const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t)));
const down = (v: number[], n = 240) => { const k = Math.max(1, Math.ceil(v.length / n)); const o: number[] = []; for (let i = 0; i < v.length; i += k) { const s = v.slice(i, i + k); o.push(s.reduce((a, b) => a + b, 0) / s.length); } return o; };
const T = ({ p, t, c = "#c9d2e6" }: { p: [number, number, number]; t: string; c?: string }) => <Html position={p} center distanceFactor={9}><div style={{ color: c, borderColor: c + "55" }} className="whitespace-nowrap rounded border bg-black/60 px-1.5 py-0.5 text-[10px]">{t}</div></Html>;

function Drift({ children }: { children: ReactNode }) {
  const g = useRef<THREE.Group>(null!);
  useFrame((s) => {
    if (!g.current) return;
    const t = s.clock.elapsedTime;
    g.current.rotation.y = Math.sin(t * 0.25) * 0.4 - 0.15;
    g.current.rotation.x = Math.sin(t * 0.18) * 0.04;
  });
  return <group ref={g} position={[3.2, -0.6, 0]}>{children}</group>;
}

/** Layered glowing "wall" (area chart in 3D) from a numeric series. */
function Wall({ vals, a, b, h = 3.4, w = 13, layers = 4, z = 0 }: { vals: number[]; a: string; b: string; h?: number; w?: number; layers?: number; z?: number }) {
  const { geo, top } = useMemo(() => {
    const n = vals.length, mx = Math.max(...vals), mn = Math.min(...vals), pos = new Float32Array(n * 6), col = new Float32Array(n * 6), idx: number[] = [], top: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) - 0.5) * w, v = ((vals[i] - mn) / (mx - mn || 1)) * h + 0.05; pos.set([x, v, 0, x, 0, 0], i * 6); const c = mix(a, b, v / h), d = mix("#02040c", a, 0.25);
      col.set([c.r, c.g, c.b, d.r, d.g, d.b], i * 6); top.push(new THREE.Vector3(x, v, 0)); if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setIndex(idx); return { geo: g, top }; }, [vals, a, b, h, w]);
  return (<group position={[0, 0, z]}>{Array.from({ length: layers }, (_, i) => (
    <group key={i} position={[0, 0, -i * 0.7]}><mesh geometry={geo}><meshBasicMaterial vertexColors transparent opacity={0.8 - i * 0.18} side={THREE.DoubleSide} depthWrite={false} /></mesh>{i < 2 && <Line points={top} color={b} lineWidth={2.2 - i} transparent opacity={1 - i * 0.5} />}</group>))}</group>);
}

/** Instanced pillars. */
function Pillars({ items }: { items: { x: number; z?: number; h: number; color: string; w?: number }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current || !items.length) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      const h = Math.max(0.04, it.h);
      o.position.set(it.x, h / 2, it.z ?? 0);
      o.scale.set(it.w ?? 0.35, h, it.w ?? 0.35);
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      ref.current!.setColorAt(i, new THREE.Color(it.color));
    });
    if (ref.current.instanceMatrix) ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[undefined, undefined, items.length]}><boxGeometry /><meshStandardMaterial roughness={0.3} metalness={0.4} emissive="#222a66" emissiveIntensity={0.6} /></instancedMesh>;
}

const Orb = ({ p, c, r = 0.22 }: { p: [number, number, number]; c: string; r?: number }) => <mesh position={p}><sphereGeometry args={[r, 24, 24]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>;

function Scene({ kind, R, series }: { kind: string; R: any; series: any[] }) {
  const full = R.models.full.models;
  if (kind === "market" || kind === "studio") {
    const v = down((kind === "market" ? series.map((s) => s.close) : series.map((s) => s.rv30 ?? 0)));
    return <Wall vals={v} a="#3b6bff" b={kind === "market" ? "#2fd18b" : "#ff5b7a"} />;
  }
  if (kind === "garch") {
    const pers = full.GARCH_normal.persistence, v = down(series.map((s) => s.garch_vol ?? 0));
    return (<><Wall vals={v} a="#3b6bff" b="#ff5b7a" /><Ring r={1.2 * pers} p={[-4.8, 3.6, 0.5]} label={`α+β = ${pers.toFixed(3)}`} /></>);
  }
  if (kind === "data") {
    const rows = series.filter((s) => s.ret !== null); const dayIdx: Record<string, number> = {};
    const items = rows.map((r) => { const ym = r.date.slice(0, 7); dayIdx[ym] = (dayIdx[ym] ?? -1) + 1; const y = +r.date.slice(0, 4) - 2015, m = +r.date.slice(5, 7) - 1;
      return { x: (y - 5) * 1.2, z: (dayIdx[ym] - 11) * 0.28, h: 0.15 + Math.abs(r.ret) * 0.35, yOff: m * 0.42, c: r.ret >= 0 ? "#2fd18b" : "#ff5b7a" }; });
    return <Lattice items={items} />;
  }
  if (kind === "statistics") {
    const b = R.histogram.bins, mx = Math.max(...b.map((x: any) => x.density)), pts = b.map((x: any, i: number) => new THREE.Vector3((i / (b.length - 1) - 0.5) * 12, (x.normal / mx) * 4.2 + 0.05, 0.3));
    return (<><Pillars items={b.map((x: any, i: number) => ({ x: (i / (b.length - 1) - 0.5) * 12, h: (x.density / mx) * 4.2, w: 0.14, color: Math.abs(x.x) > 2.5 ? "#ff5b7a" : "#4f6bff" }))} /><Line points={pts} color="#ffb454" lineWidth={3} />
      <T p={[-5.5, 0.4, 0]} t="left tail" c="#ff8aa0" /><T p={[0, 4.9, 0]} t={`kurtosis ${R.descriptive.kurtosis.toFixed(1)} · skew ${R.descriptive.skewness.toFixed(2)}`} c="#ffb454" /></>);
  }
  if (kind === "stationarity") {
    const A = R.acf, s = 16, ci = A.ci95 * s;
    const items = [...A.returns.acf.map((v: number, i: number) => ({ x: (i - 20) * 0.32, z: -1, h: Math.abs(v) * s, color: Math.abs(v) > A.ci95 ? "#ffb454" : "#4f6bff", w: 0.2 })), ...A.squared_returns.acf.map((v: number, i: number) => ({ x: (i - 20) * 0.32, z: 1, h: Math.abs(v) * s, color: "#ff5b7a", w: 0.2 }))];
    return (<><Pillars items={items} /><Line points={[new THREE.Vector3(-6.6, ci, -1), new THREE.Vector3(6.6, ci, -1)]} color="#ffb454" dashed lineWidth={1.2} /><Line points={[new THREE.Vector3(-6.6, ci, 1), new THREE.Vector3(6.6, ci, 1)]} color="#ffb454" dashed lineWidth={1.2} />
      <T p={[-7, 1, -1]} t="ACF returns" c="#8fa8ff" /><T p={[-7, 2.2, 1]} t="ACF squared returns" c="#ff8aa0" /></>);
  }
  if (kind === "egarch") {
    const N = R.news_impact, mx = Math.max(...N.map((n: any) => Math.max(n.garch_var, n.egarch_var))), mk = (k: string, zz: number) => N.map((n: any, i: number) => new THREE.Vector3((i / (N.length - 1) - 0.5) * 12, (n[k] / mx) * 4.2, zz));
    const at = (z: number) => N.reduce((b: any, n: any) => (Math.abs(n.z - z) < Math.abs(b.z - z) ? n : b)); const neg = at(-2), pos = at(2);
    return (<><Wall vals={N.map((n: any) => n.egarch_var)} a="#7b2cff" b="#ff5b7a" layers={3} /><Line points={mk("garch_var", 0.3)} color="#4fa0ff" lineWidth={3.5} />
      <Orb p={[-12 / 4 * 1, (neg.egarch_var / mx) * 4.2 + 0.1, 0]} c="#ff5b7a" /><Orb p={[12 / 4, (pos.egarch_var / mx) * 4.2 + 0.1, 0]} c="#2fd18b" />
      <T p={[-3, (neg.egarch_var / mx) * 4.2 + 0.8, 0]} t={`z=−2: ${neg.egarch_var.toFixed(2)}`} c="#ff8aa0" /><T p={[3, (pos.egarch_var / mx) * 4.2 + 0.8, 0]} t={`z=+2: ${pos.egarch_var.toFixed(2)}`} c="#7dffc4" /><T p={[0, 4.9, 0]} t="blue = GARCH (symmetric)" c="#4fa0ff" /></>);
  }
  if (kind === "robustness") {
    const ks = ["pre", "covid", "post", "full"]; const items: any[] = [], labels: ReactNode[] = [];
    ks.forEach((k, i) => ["normal", "t"].forEach((d, j) => { const m = R.models[k].models[`EGARCH_${d}`]; if (!m?.gamma_test) return; const g = m.gamma_test, h = Math.abs(g.gamma) * 11; const x = (i - 1.5) * 2.5 + (j - 0.5) * 0.8;
      items.push({ x, h, w: 0.6, color: g.p_two_sided < 0.05 ? (d === "t" ? "#b57cff" : "#ff5b7a") : "#6b7596" }); }));
    return (<><Pillars items={items} />{ks.map((k, i) => <T key={k} p={[(i - 1.5) * 2.5, -0.5, 0]} t={R.models[k].label.split(" (")[0]} />)}<T p={[0, 4.4, 0]} t="|γ| per period · red/violet = significant" c="#ffb454" /></>);
  }
  if (kind === "comparison") {
    const C = R.comparison, a = Math.min(...C.map((c: any) => c.aic)), b = Math.min(...C.map((c: any) => c.bic)), mx = Math.max(...C.map((c: any) => Math.max(c.aic - a, c.bic - b)), 1);
    const items = C.flatMap((c: any, i: number) => [{ x: (i - 1.5) * 2.4 - 0.4, h: ((c.aic - a) / mx) * 4 + 0.05, w: 0.6, color: "#4f6bff" }, { x: (i - 1.5) * 2.4 + 0.4, h: ((c.bic - b) / mx) * 4 + 0.05, w: 0.6, color: "#b57cff" }]);
    return (<><Pillars items={items} />{C.map((c: any, i: number) => <T key={c.model} p={[(i - 1.5) * 2.4, -0.5, 0]} t={c.model.replace("_", " ")} />)}<T p={[0, 4.6, 0]} t="ΔAIC (blue) · ΔBIC (violet) vs best model" c="#9fb0e0" /></>);
  }
  if (kind === "findings") {
    const g = full.EGARCH_normal.gamma_test, sc = 18, x = (v: number) => v * sc;
    return (<><Line points={[new THREE.Vector3(x(g.ci_low), 1.5, 0), new THREE.Vector3(x(g.ci_high), 1.5, 0)]} color="#8fa8ff" lineWidth={5} /><Line points={[new THREE.Vector3(-6, 1.5, 0), new THREE.Vector3(3, 1.5, 0)]} color="#2a3a7a" lineWidth={1} />
      <Orb p={[x(g.gamma), 1.5, 0]} c={g.decision === "negative_significant" ? "#ff5b7a" : "#ffb454"} r={0.5} /><Orb p={[0, 1.5, 0]} c="#ffffff" r={0.18} /><Orb p={[x(g.ci_low), 1.5, 0]} c="#8fa8ff" r={0.14} /><Orb p={[x(g.ci_high), 1.5, 0]} c="#8fa8ff" r={0.14} />
      <T p={[x(g.gamma), 2.6, 0]} t={`γ = ${g.gamma.toFixed(4)}`} c="#ff8aa0" /><T p={[0, 0.6, 0]} t="0 (symmetry, H0)" /><T p={[x((g.ci_low + g.ci_high) / 2), 0.6, 0]} t="95% CI" c="#8fa8ff" /></>);
  }
  /* methodology: helix of pipeline stages */
  const steps = ["CSV", "Clean", "Returns", "ADF/ARCH", "GARCH", "EGARCH", "Robust", "Compare", "Report"];
  const pts = steps.map((_, i) => new THREE.Vector3(Math.cos(i * 0.75) * 3 + 0, (i - 4) * 0.7, Math.sin(i * 0.75) * 3));
  return (<group position={[-3.2, 2.2, 0]}><Line points={pts} color="#6b7cff" lineWidth={2.5} />{pts.map((p, i) => <group key={i}><Orb p={p.toArray() as [number, number, number]} c={i === 5 ? "#ff5b7a" : "#8fa8ff"} r={0.2} /><T p={[p.x, p.y + 0.5, p.z]} t={`${i + 1}. ${steps[i]}`} /></group>)}</group>);
}

function Ring({ r, p, label }: { r: number; p: [number, number, number]; label: string }) {
  const m = useRef<THREE.Mesh>(null);
  useFrame((s) => {
    if (!m.current) return;
    m.current.rotation.x = s.clock.elapsedTime * 0.6;
    m.current.rotation.y = s.clock.elapsedTime * 0.3;
  });
  return (<group position={p}><mesh ref={m}><torusGeometry args={[r, 0.07, 16, 80]} /><meshBasicMaterial color="#9b5cff" toneMapped={false} /></mesh><T p={[0, -r - 0.5, 0]} t={label} c="#b79cff" /></group>);
}
function Lattice({ items }: { items: { x: number; z: number; h: number; yOff: number; c: string }[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!ref.current || !items.length) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, it.yOff, it.z);
      o.scale.setScalar(Math.min(0.28, 0.05 + it.h * 0.1));
      o.updateMatrix();
      ref.current!.setMatrixAt(i, o.matrix);
      ref.current!.setColorAt(i, new THREE.Color(it.c));
    });
    if (ref.current.instanceMatrix) ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return (<group position={[0, 0.2, 0]}><instancedMesh ref={ref} args={[undefined, undefined, items.length]}><boxGeometry /><meshBasicMaterial toneMapped={false} /></instancedMesh>
    <T p={[-6.6, -0.5, 0]} t="2015" /><T p={[5.4, -0.5, 0]} t="2025" /><T p={[0, 5.4, 0]} t="each cube = one trading day · size = |return| · green/red = sign" c="#9fb0e0" /></group>);
}

export default function PageHero({ kind }: { kind: string }) {
  const { R, series } = useData(); const [ok, setOk] = useState(true);
  useEffect(() => { const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; setOk(!reduce); }, []);
  if (!R || !series.length || !ok) return <div className="h-full w-full bg-gradient-to-br from-violet/10 to-volt/10" />;
  return (<Canvas dpr={[1, 1.5]} camera={{ position: [0, 3.2, 12.5], fov: 42 }} gl={{ antialias: true }}><color attach="background" args={["#02040c"]} /><fog attach="fog" args={["#02040c", 14, 34]} />
    <ambientLight intensity={0.7} /><pointLight position={[5, 8, 6]} intensity={90} color="#7b8cff" /><pointLight position={[-6, 3, -4]} intensity={60} color="#ff5b9a" />
    <Sparkles count={70} scale={[18, 7, 9]} size={2.4} speed={0.35} color="#9b8cff" /><Drift><Scene kind={kind} R={R} series={series} /></Drift><Fx intensity={1} /></Canvas>);
}
