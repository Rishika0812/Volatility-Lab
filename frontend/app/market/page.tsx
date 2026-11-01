"use client";
import { useMemo } from "react";
import { Gate, Panel, PageHeader, Stat } from "@/components/ui";
import { AreaC, DateRange, LineC, useRange } from "@/components/charts";
import { f } from "@/lib/api";

function Inner({ series }: { series: any[] }) {
  const { out, a, b, setA, setB } = useRange(series);
  const st = useMemo(() => {
    const r = out.map((x) => x.ret).filter((v): v is number => v !== null);
    const first = out[0], last = out[out.length - 1];
    let peak = -Infinity, mdd = 0; out.forEach((x) => { peak = Math.max(peak, x.close); mdd = Math.min(mdd, x.close / peak - 1); });
    const mean = r.reduce((s, v) => s + v, 0) / (r.length || 1), sd = Math.sqrt(r.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, r.length - 1));
    return { tot: last && first ? (last.close / first.close - 1) * 100 : 0, pos: r.filter((v) => v > 0).length, neg: r.filter((v) => v < 0).length, mdd: mdd * 100, sd, ann: sd * Math.sqrt(252), best: Math.max(...r), worst: Math.min(...r), n: r.length, first, last };
  }, [out]);
  return (<>
    <PageHeader scene="market" kicker="Page 2 · Market overview" title="Nifty 50 market overview">Closing prices, daily log returns and realised volatility for the selected window. Descriptive arithmetic only; model estimates live on the GARCH/EGARCH pages.</PageHeader>
    <div className="mb-4"><DateRange a={a} b={b} setA={setA} setB={setB} min={series[0].date} max={series[series.length - 1].date} /></div>
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
      <Stat label="Price change" value={`${f(st.tot, 1)}%`} tone={st.tot >= 0 ? "bull" : "bear"} sub={`${st.first?.close.toLocaleString()} → ${st.last?.close.toLocaleString()}`} />
      <Stat label="Daily σ" value={`${f(st.sd, 3)}%`} sub={`${f(st.ann, 1)}% annualised`} /><Stat label="Max drawdown" value={`${f(st.mdd, 1)}%`} tone="bear" />
      <Stat label="Best / worst day" value={<span className="text-lg"><span className="text-bull">{f(st.best, 2)}</span> / <span className="text-bear">{f(st.worst, 2)}</span></span>} />
      <Stat label="Positive days" value={st.pos} tone="bull" sub={`${f((st.pos / st.n) * 100, 1)}%`} /><Stat label="Negative days" value={st.neg} tone="bear" sub={`${f((st.neg / st.n) * 100, 1)}%`} /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Closing price (index points)"><AreaC data={out} x="date" y="close" /></Panel>
      <Panel title="Daily log returns (%)"><LineC data={out} x="date" lines={[{ key: "ret", name: "Return %", color: "#7ea2ff", width: 1 }]} /></Panel>
      <Panel title="Rolling 30-day volatility (daily σ, %)"><AreaC data={out.filter((r) => r.rv30 !== null)} x="date" y="rv30" color="#9b5cff" /></Panel>
      <Panel title="Positive vs negative days"><div className="flex h-[280px] items-center gap-6"><div className="flex-1"><div className="flex h-10 overflow-hidden rounded-lg"><div style={{ width: `${(st.pos / (st.pos + st.neg)) * 100}%` }} className="grid place-items-center bg-bull/80 text-sm font-semibold text-navy-950">{st.pos}</div>
        <div style={{ width: `${(st.neg / (st.pos + st.neg)) * 100}%` }} className="grid place-items-center bg-bear/80 text-sm font-semibold text-white">{st.neg}</div></div>
        <p className="mt-3 text-sm text-silver/70">Up-days outnumber down-days, yet the largest moves are on the downside, a first hint of negative skewness.</p></div></div></Panel>
    </div></>);
}
export default function Page() { return <Gate>{({ series }) => <Inner series={series} />}</Gate>; }
