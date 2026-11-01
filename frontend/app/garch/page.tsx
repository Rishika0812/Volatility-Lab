"use client";
import { Gate, Panel, PageHeader, Interpret, Eq, Stat, Badge } from "@/components/ui";
import { LineC, DateRange, useRange } from "@/components/charts";
import { DiagTable, ParamTable } from "@/components/ModelTables";
import { f } from "@/lib/api";

function Inner({ R, series }: { R: any; series: any[] }) {
  const m = R.models.full.models.GARCH_normal, mt = R.models.full.models.GARCH_t; const P: any = Object.fromEntries(m.params.map((p: any) => [p.name, p]));
  const { out, a, b, setA, setB } = useRange(series.filter((r) => r.garch_vol !== null));
  const pers = m.persistence;
  return (<>
    <PageHeader scene="garch" kicker="Page 6 · GARCH lab" title="GARCH(1,1): the symmetric benchmark">Variance reacts to the SQUARE of last period&apos;s shock, so a +2σ and a −2σ move are treated identically.</PageHeader>
    <Panel title="Model"><Eq>{"r(t) = μ + ε(t)          ε(t) = σ(t)·z(t),  z ~ N(0,1)\nσ²(t) = ω + α·ε²(t−1) + β·σ²(t−1)"}</Eq>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-4"><Interpret><b>ω</b>: baseline variance component (long-run level, together with α and β).</Interpret><Interpret><b>α</b>: reaction to recent shocks (how much yesterday&apos;s ε² moves variance).</Interpret>
        <Interpret><b>β</b>: persistence of previous conditional variance.</Interpret><Interpret><b>α + β</b>: overall volatility persistence; &lt; 1 required for a finite unconditional variance.</Interpret></div></Panel>
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]"><Panel title="Estimates · normal innovations · full sample" right={<Badge ok={m.converged}>{m.converged ? "converged" : "failed"}</Badge>}><ParamTable m={m} /></Panel>
      <div className="grid grid-cols-2 gap-3 self-start"><Stat label="α + β" value={f(pers, 4)} tone={pers < 1 ? "volt" : "bear"} sub={m.persistence_state} /><Stat label="Half-life" value={m.half_life_days ? `${f(m.half_life_days, 1)} d` : "—"} sub="of a variance shock" />
        <Stat label="Unconditional σ" value={m.unconditional_vol ? `${f(m.unconditional_vol, 3)}%` : "n/a"} sub="daily, model-implied" /><Stat label="Max cond. σ" value={`${f(m.cond_vol_max, 2)}%`} sub={m.cond_vol_max_date} /></div></div>
    <div className="mt-5"><Interpret tone={pers < 1 ? "info" : "warn"}>α + β = <b>{f(pers, 4)}</b> is <b>{pers < 1 ? "below" : pers === 1 ? "equal to" : "above"} one</b>. {pers < 1 ? "The volatility process is covariance-stationary: shocks decay geometrically and the unconditional variance ω/(1−α−β) exists. Values close to 1 mean volatility shocks are very persistent (long memory-like behaviour)." : "The variance process is non-stationary or explosive; unconditional variance is undefined and long-horizon results must be interpreted with great caution."}
      {" "}Model assumptions: symmetric response to shocks, constant mean, and (here) normal innovations; the Student-t variant below relaxes the last.</Interpret></div>
    <Panel title="Conditional volatility σ(t), daily %" className="mt-5" right={<DateRange a={a} b={b} setA={setA} setB={setB} min={series[0].date} max={series[series.length - 1].date} />}>
      <LineC data={out} x="date" lines={[{ key: "garch_vol", name: "GARCH σ(t)", color: "#4f8bff" }, { key: "rv30", name: "30d realised σ", color: "#ffffff55", width: 1 }]} height={320} /></Panel>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Residual diagnostics (standardised)"><DiagTable m={m} /></Panel><Panel title="Student-t variant"><ParamTable m={mt} /></Panel></div></>);
}
export default function Page() { return <Gate>{({ R, series }) => <Inner R={R} series={series} />}</Gate>; }
