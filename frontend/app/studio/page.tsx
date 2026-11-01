"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gate, Interpret, PageHeader, Panel, Stat } from "@/components/ui";
import { f } from "@/lib/api";
import TouchGate from "@/components/TouchGate";

const L = <div className="grid h-full place-items-center text-sm text-silver/50">Initialising 3D view…</div>;
const NicSurface3D = dynamic(() => import("@/components/Studio3D").then((m) => m.NicSurface3D), { ssr: false, loading: () => L });
const MonthlyVol3D = dynamic(() => import("@/components/Studio3D").then((m) => m.MonthlyVol3D), { ssr: false, loading: () => L });
const ReturnCloud3D = dynamic(() => import("@/components/Studio3D").then((m) => m.ReturnCloud3D), { ssr: false, loading: () => L });
const Box = ({ children }: { children: (on: boolean) => React.ReactNode }) => <TouchGate className="h-[340px] overflow-hidden rounded-xl border border-edge sm:h-[460px]">{children}</TouchGate>;

function Inner({ R, series }: { R: any; series: any[] }) {
  const [mode, setMode] = useState<"garch" | "egarch" | "diff">("egarch");
  const rg = R.rolling_gamma.filter((x: any) => x.gamma !== null);
  const sig = rg.filter((x: any) => x.p < 0.05).length, neg = rg.filter((x: any) => x.gamma < 0).length;
  const cells = useMemo(() => { const m = new Map<string, number[]>(); series.forEach((r) => { if (r.ret === null) return; const k = r.date.slice(0, 7); (m.get(k) || m.set(k, []).get(k)!).push(r.ret); });
    return [...m.entries()].filter(([, v]) => v.length > 5).map(([k, v]) => { const mu = v.reduce((a, b) => a + b, 0) / v.length; return { y: +k.slice(0, 4), m: +k.slice(5) - 1, v: Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1)) }; }); }, [series]);
  const years = useMemo(() => [...new Set(cells.map((c) => c.y))], [cells]);
  const rows = useMemo(() => series.filter((r) => r.ret !== null).map((r) => ({ date: r.date, ret: r.ret as number })), [series]);
  const after = useMemo(() => { const a: number[] = [], b: number[] = []; for (let i = 0; i < rows.length - 1; i++) (rows[i].ret < 0 ? a : b).push(Math.abs(rows[i + 1].ret)); const m = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length; return { neg: m(a), pos: m(b), nn: a.length, np: b.length }; }, [rows]);
  const rgData = rg.map((x: any) => ({ date: x.date, gamma: x.gamma, band: [x.lo, x.hi] }));
  return (<>
    <PageHeader scene="studio" kicker="Advanced analysis studio" title="Volatility in three dimensions">Four advanced views: model-implied news-impact surface, rolling-window γ, realised-volatility calendar and a return cloud. Drag to orbit and scroll to zoom (on phones tap “Rotate 3D” first).</PageHeader>
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="News-impact surface (EGARCH vs GARCH)" right={<div className="flex gap-1 text-xs">{(["garch", "egarch", "diff"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 ${mode === m ? "bg-volt/30 text-white" : "bg-white/5 text-silver"}`}>{m === "diff" ? "EGARCH − GARCH" : m.toUpperCase()}</button>)}</div>}>
        <Box>{(on) => <NicSurface3D S={R.nic_surface} mode={mode} enabled={on} />}</Box>
        <p className="mt-2 text-xs text-silver/60">Height/colour = next-day conditional variance for each standardised shock (x) and prior volatility state (depth). GARCH is mirror-symmetric in z; tilt in the EGARCH surface comes from the estimated γ = {f(R.models.full.models.EGARCH_normal.gamma_test.gamma, 4)}. Model-implied, not a forecast.</p></Panel>
      <Panel title="Realised volatility calendar (monthly σ of daily returns)"><Box>{(on) => <MonthlyVol3D cells={cells} years={years} enabled={on} />}</Box>
        <p className="mt-2 text-xs text-silver/60">Each bar = standard deviation of daily log returns in that calendar month (descriptive, from your data). The March 2020 spike is the tallest structure.</p></Panel>
      <Panel title="Return cloud: today's return vs tomorrow's magnitude"><Box>{(on) => <ReturnCloud3D rows={rows} enabled={on} />}</Box>
        <div className="mt-3 grid grid-cols-2 gap-3"><Stat label="Avg |r(t+1)| after a down day" value={`${f(after.neg, 3)}%`} tone="bear" sub={`${after.nn} days`} /><Stat label="Avg |r(t+1)| after an up day" value={`${f(after.pos, 3)}%`} tone="bull" sub={`${after.np} days`} /></div>
        <p className="mt-2 text-xs text-silver/60">Simple descriptive means, not model output. They hint at asymmetry but ignore the mean/level of volatility; EGARCH γ is the formal test.</p></Panel>
      <Panel title="Rolling-window EGARCH γ (504-day window, step 21 days)"><div className="h-[300px]"><ResponsiveContainer><ComposedChart data={rgData} margin={{ left: 0, right: 12, top: 8 }}><CartesianGrid stroke="#ffffff10" />
        <XAxis dataKey="date" stroke="#6f7fa8" fontSize={11} minTickGap={50} /><YAxis stroke="#6f7fa8" fontSize={11} width={46} domain={["auto", "auto"]} /><Tooltip contentStyle={{ background: "#070a18", border: "1px solid #2a3a6a" }} formatter={(v: any) => Array.isArray(v) ? `[${v[0].toFixed(3)}, ${v[1].toFixed(3)}]` : Number(v).toFixed(4)} />
        <ReferenceLine y={0} stroke="#ff9f43" strokeDasharray="4 3" /><Area dataKey="band" name="95% CI" stroke="none" fill="#7b5cff" fillOpacity={0.22} isAnimationActive={false} /><Line dataKey="gamma" name="γ" stroke="#ff5b7a" dot={false} strokeWidth={2} isAnimationActive={false} /><Legend /></ComposedChart></ResponsiveContainer></div>
        <div className="mt-3 grid grid-cols-3 gap-3"><Stat label="Windows" value={rg.length} /><Stat label="γ < 0" value={`${neg}/${rg.length}`} tone="bear" /><Stat label="Significant (5%)" value={`${sig}/${rg.length}`} tone="volt" /></div>
        <div className="mt-3"><Interpret tone="warn">Overlapping windows are highly dependent, so these are not independent tests and are descriptive of stability only. Intervals that cross zero indicate windows where asymmetry is not statistically distinguishable from zero.</Interpret></div></Panel></div></>);
}
export default function Page() { return <Gate>{({ R, series }) => <Inner R={R} series={series} />}</Gate>; }
