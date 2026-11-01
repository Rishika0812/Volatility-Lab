"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Gate, Panel, PageHeader, Interpret, Eq, Stat, Badge, Table } from "@/components/ui";
import { LineC } from "@/components/charts";
import { DiagTable, ParamTable } from "@/components/ModelTables";
import { f, getJSON, pv } from "@/lib/api";
import TouchGate from "@/components/TouchGate";

const ShockLab3D = dynamic(() => import("@/components/ShockLab3D"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-silver/60">Initialising 3D lab…</div> });

function Simulator({ initial }: { initial: any }) {
  const [k, setK] = useState(2); const [dist, setDist] = useState<"normal" | "t">("normal"); const [sim, setSim] = useState<any>(initial); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [view3d, setView3d] = useState(true);
  const t = useRef<any>(null);
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(async () => { setBusy(true);
    try { setSim(await getJSON("/api/simulate-shock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k, horizon: 40, dist }) })); setErr(""); } catch (e: any) { setErr(e.message); } setBusy(false); }, 200); return () => clearTimeout(t.current); }, [k, dist]);
  const d = sim.impact_day1; const H = sim.egarch.positive.vol.length;
  const rows = Array.from({ length: H }, (_, i) => ({ day: i + 1, gp: sim.garch.positive.vol[i], gn: sim.garch.negative.vol[i], ep: sim.egarch.positive.vol[i], en: sim.egarch.negative.vol[i],
    diff: sim.egarch.negative.pct_change_variance[i] - sim.egarch.positive.pct_change_variance[i] }));
  useEffect(() => { if (!window.matchMedia) return; if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setView3d(false); }, []);
  return (<Panel title="Asymmetric shock simulator · model-implied experiment" right={busy ? <Loader2 className="h-4 w-4 animate-spin text-volt" /> : <Badge ok>live from /api/simulate-shock</Badge>}>
    <Interpret tone="warn"><b>Model-implied experiment, not a market forecast.</b> The shock is a standardised innovation of ±k sd hitting a market at its model steady state; later innovations are held at the reference assumption (GARCH: E[ε²]=σ²; EGARCH: news term = 0) in both scenarios. Parameters are the ESTIMATED full-sample values; computation is done in Python.</Interpret>
    <div className="my-4 flex flex-wrap items-center gap-4 text-sm"><label className="flex items-center gap-3">Shock size <input type="range" min={0.5} max={5} step={0.1} value={k} onChange={(e) => setK(+e.target.value)} className="w-full max-w-xs" /><b className="font-mono text-white">±{k.toFixed(1)} sd</b></label>
      <div className="flex gap-1 text-xs">{(["normal", "t"] as const).map((x) => <button key={x} onClick={() => setDist(x)} className={`rounded-md px-3 py-1 ${dist === x ? "bg-volt/30 text-white" : "bg-white/5"}`}>{x === "t" ? "Student-t params" : "Normal params"}</button>)}</div>
      <button className="rounded-md bg-white/5 px-3 py-1 text-xs" onClick={() => setView3d((v) => !v)}>{view3d ? "2D view" : "3D view"}</button></div>
    {err && <Interpret tone="warn">{err}</Interpret>}
    {view3d ? <TouchGate className="h-[360px] overflow-hidden rounded-xl border border-edge sm:h-[460px]">{(on) => <><ShockLab3D sim={sim} enabled={on} /><div className="pointer-events-none absolute bottom-2 left-3 right-3 text-[10px] text-silver/60 sm:text-[11px]">Surface: EGARCH σ over days 1–40 (x) and shock size 0–5 sd (depth). Blue line = GARCH, coloured line = EGARCH path for the selected shock. Drag to orbit.</div></>}</TouchGate>
      : <div className="grid gap-4 md:grid-cols-2"><LineC data={rows} x="day" lines={[{ key: "gp", name: "GARCH +", color: "#4f8bff" }, { key: "ep", name: "EGARCH +", color: "#2fd18b" }]} /><LineC data={rows} x="day" lines={[{ key: "gn", name: "GARCH −", color: "#4f8bff" }, { key: "en", name: "EGARCH −", color: "#d1566b" }]} /></div>}
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
      <Stat label="Initial shock" value={`±${k.toFixed(1)} sd`} sub={`≈ ±${f(sim.initial_shock.return_pct, 2)}% return`} /><Stat label="GARCH σ day 1 (±)" value={`${f(d.garch_pos_vol, 3)}%`} sub={`variance ${f(d.garch_pct_var, 1)}% vs baseline`} />
      <Stat label="EGARCH σ day 1 (+)" value={`${f(d.egarch_pos_vol, 3)}%`} tone="bull" sub={`variance ${f(d.egarch_pos_pct_var, 1)}%`} /><Stat label="EGARCH σ day 1 (−)" value={`${f(d.egarch_neg_vol, 3)}%`} tone="bear" sub={`variance ${f(d.egarch_neg_pct_var, 1)}%`} />
      <Stat label="Neg − pos (var, pp)" value={f(d.egarch_neg_minus_pos_pct_var, 1)} sub="% of baseline variance" /><Stat label="Variance ratio" value={f(d.egarch_var_ratio_neg_over_pos, 3)} sub="negative ÷ positive, day 1" /></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2"><div><div className="mb-1 text-xs uppercase tracking-widest text-silver/60">Volatility response (daily σ %)</div>
      <LineC data={rows} x="day" lines={[{ key: "gp", name: "GARCH (+/−)", color: "#4f8bff", dash: "5 4" }, { key: "ep", name: "EGARCH +", color: "#2fd18b" }, { key: "en", name: "EGARCH −", color: "#d1566b" }]} /></div>
      <div><div className="mb-1 text-xs uppercase tracking-widest text-silver/60">EGARCH: negative minus positive, % of baseline variance</div><LineC data={rows} x="day" lines={[{ key: "diff", name: "difference (pp)", color: "#9b5cff", width: 2 }]} /></div></div>
    <p className="mt-3 text-xs text-silver/60">Under GARCH the two scenarios coincide exactly (the shock is squared). Any gap in the EGARCH scenarios comes from the estimated γ = {f(sim.params.egarch.gamma, 4)}; if γ were not significantly different from zero the gap would not be statistically meaningful.</p></Panel>);
}

export default function Page() {
  return (<Gate>{({ R, series }) => { const m = R.models.full.models.EGARCH_normal, mt = R.models.full.models.EGARCH_t; const g = m.gamma_test;
    const nic = R.news_impact;
    return (<>
      <PageHeader scene="egarch" kicker="Page 7 · EGARCH lab" title="EGARCH(1,1): testing asymmetry through γ">The signed term γ·z(t−1) lets positive and negative standardised shocks affect log-variance differently. We read the data; we do not presume the answer.</PageHeader>
      <Panel title="Model"><Eq>{"ln σ²(t) = ω + β·ln σ²(t−1) + α·( |z(t−1)| − E|z| ) + γ·z(t−1),     z(t) = ε(t)/σ(t)"}</Eq>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-4"><Interpret><b>ω</b>: baseline log variance.</Interpret><Interpret><b>β</b>: persistence of conditional log variance.</Interpret><Interpret><b>α</b>: response to shock <i>magnitude</i>.</Interpret><Interpret><b>γ</b>: response to shock <i>direction</i>. γ&lt;0 &amp; significant ⇒ negative shocks raise volatility more.</Interpret></div></Panel>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]"><Panel title="EGARCH estimates · normal · full sample" right={<Badge ok={m.converged}>{m.converged ? "converged" : "failed"}</Badge>}><ParamTable m={m} /></Panel>
        <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Stat label="γ (gamma)" value={f(g.gamma, 4)} tone={g.decision === "negative_significant" ? "bear" : g.decision === "positive_significant" ? "bull" : "volt"} sub={`t = ${f(g.t, 2)}`} />
          <Stat label="p-value" value={pv(g.p_two_sided)} sub={`one-sided (γ<0): ${pv(g.p_one_sided_negative)}`} /></div><Stat label="95% CI for γ" value={<span className="text-lg">[{f(g.ci_low, 4)}, {f(g.ci_high, 4)}]</span>} />
          <Interpret tone={g.decision === "insignificant" ? "warn" : "good"}>{g.interpretation}</Interpret></div></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="News impact curve (next-day variance vs standardised shock)"><LineC data={nic} x="z" lines={[{ key: "garch_var", name: "GARCH (symmetric)", color: "#4f8bff" }, { key: "egarch_var", name: "EGARCH", color: "#d1566b", width: 2 }]} yFmt={(v) => v.toFixed(2)} />
          <p className="mt-2 text-xs text-silver/60">x-axis: z, the standardised shock (negative z = negative innovation). The EGARCH curve is steeper on the left if γ&lt;0. Starting from the model steady state.</p></Panel>
        <Panel title="Student-t EGARCH (robustness)"><ParamTable m={mt} /><div className="mt-3"><Interpret>{mt.gamma_test?.interpretation}</Interpret></div></Panel></div>
      <div className="mt-5"><Simulator initial={R.default_simulation} /></div>
      <Panel title="Residual diagnostics (standardised)" className="mt-5"><DiagTable m={m} /></Panel>
      <Panel title="Negative returns ≠ negative innovations" className="mt-5"><p className="text-sm text-silver/80">EGARCH responds to the <i>standardised innovation</i> z(t−1) = ε(t−1)/σ(t−1), where ε = r − μ. A day with a small positive return can still be a negative innovation if μ is positive and σ is tiny, and a −0.5% return can be a mild shock in a turbulent regime. γ is therefore an asymmetry in response to innovations, not simply to the sign of the raw return.</p></Panel></>); }}</Gate>);
}
