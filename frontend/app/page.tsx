"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Box, Square } from "lucide-react";
import { Gate, Panel, Stat } from "@/components/ui";
import { AreaC } from "@/components/charts";
import { f } from "@/lib/api";
import TouchGate from "@/components/TouchGate";
import type { Hud } from "@/components/Hero3D";

const Hero3D = dynamic(() => import("@/components/Hero3D"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-silver/60">Initialising 3D scene…</div> });

const STAGES = ["Data cleaning & log returns", "Stationarity (ADF) & ARCH-LM", "GARCH(1,1) benchmark", "EGARCH(1,1) asymmetry (γ)", "COVID robustness & Student-t", "Model comparison & forecasts"];

function Home() {
  return (<Gate>{({ R, series }) => <Hero R={R} series={series} />}</Gate>);
}
function Hero({ R, series }: { R: any; series: any[] }) {
  const [mode3d, setMode3d] = useState(true);
  const [hud, setHud] = useState<Hud | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } })();
    if (reduce || !gl) setMode3d(false);
  }, []);
  const g = R.findings;
  return (<div>
    <div className="glass relative h-[58vh] min-h-[380px] overflow-hidden">
      {mode3d ? <TouchGate className="h-full">{(on) => <Hero3D terrain={R.terrain} rows={series} onHud={setHud} enabled={on} />}</TouchGate> : (
        <div className="h-full p-6"><div className="mb-2 text-xs uppercase tracking-widest text-silver/60">2D view · Nifty 50 rolling 30-day volatility (daily %)</div><AreaC data={series.filter((r) => r.rv30 !== null)} x="date" y="rv30" color="#9b5cff" height={340} /></div>)}
      <button onClick={() => setMode3d((m) => !m)} className="absolute right-3 top-3 flex items-center gap-2 rounded-lg border border-edge bg-black/70 px-3 py-1.5 text-xs text-silver hover:text-white">
        {mode3d ? <><Square className="h-3.5 w-3.5" /> 2D / reduced motion</> : <><Box className="h-3.5 w-3.5" /> 3D view</>}</button>
      {mode3d && hud && <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-edge bg-black/70 p-3 font-mono text-xs"><div className="text-silver/60">PLAYHEAD (real data)</div>
        <div className="text-white">{hud.date} · Nifty {hud.close.toLocaleString()}</div><div className="text-violet">30d vol {f(hud.vol, 3)}% / day</div></div>}
      <div className="pointer-events-none absolute bottom-3 right-3 hidden max-w-xs md:block text-right text-[11px] text-silver/50">Terrain: rolling realised volatility (5–120d windows) of Nifty 50, 2015–2025. Particles: daily returns (green ≥ 0, red &lt; 0).</div>
    </div>
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div><div className="text-xs font-semibold uppercase tracking-[0.3em] text-violet">Econometric research laboratory</div>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-white sm:text-4xl md:text-5xl">VOLATILITY LAB</h1>
        <p className="mt-1 text-xl text-silver/90">Understanding Asymmetric Volatility in the Indian Equity Market</p>
        <p className="mt-4 max-w-2xl text-silver/75"><b className="text-white">Research question:</b> do negative market-return shocks have a stronger effect on subsequent conditional volatility than positive shocks of comparable magnitude?
          We test H₀ (symmetry, γ = 0) against H₁ (negative shocks matter more, γ &lt; 0) using GARCH(1,1) and EGARCH(1,1) on daily Nifty 50 log returns.</p>
        <Link href="/studio" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-volt to-violet px-6 py-3 font-semibold tracking-wider text-white shadow-lg shadow-volt/30 transition hover:scale-[1.02]">EXPLORE THE RESEARCH <ArrowRight className="h-4 w-4" /></Link></div>
      <div className="grid grid-cols-2 gap-3"><Stat label="Sample" value="2015–2025" sub={`${R.meta.sample.start} → ${R.meta.sample.end}`} />
        <Stat label="Daily returns" value={R.meta.sample.observations_returns.toLocaleString()} sub="log returns, %" /><Stat label="Daily σ" value={f(R.descriptive.std, 3) + "%"} sub={`${f(R.descriptive.annualised_vol_pct, 1)}% annualised`} />
        <Stat label="Full-sample EGARCH γ" value={f(R.models.full.models.EGARCH_normal.gamma_test.gamma, 4)} tone={R.models.full.models.EGARCH_normal.gamma_test.gamma < 0 ? "bear" : "bull"} sub={`p = ${f(R.models.full.models.EGARCH_normal.gamma_test.p_two_sided, 4)}`} /></div>
    </motion.div>
    <Panel title="Research stages" className="mt-8"><div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">{STAGES.map((s, i) => (
      <div key={s} className="rounded-xl border border-edge bg-navy-900/60 p-3"><div className="font-mono text-xs text-volt">0{i + 1}</div><div className="mt-1 text-sm text-silver">{s}</div></div>))}</div>
      <p className="mt-4 text-xs text-silver/55">Current hypothesis decision (full sample, EGARCH-normal): <span className="text-white">{g.hypothesis_decision}</span>.</p></Panel>
  </div>);
}
export default Home;
