"use client";
import { Gate, Panel, PageHeader, Table, Interpret, Eq } from "@/components/ui";
import { HistC, LineC } from "@/components/charts";
import { f, pv } from "@/lib/api";

export default function Page() {
  return (<Gate>{({ R, series }) => { const d = R.descriptive; const per = R.descriptive_by_period;
    const rows: any[][] = [["Observations", d.n], ["Mean (%)", f(d.mean)], ["Median (%)", f(d.median)], ["Std. deviation (%)", f(d.std)], ["Minimum (%)", f(d.min, 3)], ["Maximum (%)", f(d.max, 3)],
      ["Skewness", f(d.skewness, 3)], ["Kurtosis (normal = 3)", f(d.kurtosis, 2)], ["Jarque-Bera", f(d.jarque_bera, 1)], ["JB p-value", pv(d.jarque_bera_p)],
      ["Positive / negative / zero days", `${d.positive_days} / ${d.negative_days} / ${d.zero_days}`], ["Average positive return (%)", f(d.avg_positive)], ["Average negative return (%)", f(d.avg_negative)]];
    const sq = series.filter((r) => r.ret !== null).map((r) => ({ date: r.date, sq: (r.ret as number) ** 2, rv: r.rv30 }));
    return (<>
      <PageHeader scene="statistics" kicker="Page 4 · Descriptive statistics" title="Distribution of daily Nifty 50 log returns">r(t) = 100 × ln(P(t)/P(t−1)); {d.n.toLocaleString()} observations, 2015–2025.</PageHeader>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]"><Panel title="Statistical summary"><Table head={["Statistic", "Value"]} rows={rows} /></Panel>
        <Panel title="Return distribution vs normal"><HistC bins={R.histogram.bins} /></Panel></div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Interpret>Skewness = <b>{f(d.skewness, 2)}</b>: {d.skewness < 0 ? "the left tail (large losses) is longer than the right tail." : "the right tail is longer."}</Interpret>
        <Interpret>Kurtosis = <b>{f(d.kurtosis, 1)}</b> versus 3 for a normal distribution: extreme days are far more frequent than a Gaussian model implies (fat tails).</Interpret>
        <Interpret tone={d.jarque_bera_p < 0.05 ? "warn" : "info"}>Jarque-Bera p = {pv(d.jarque_bera_p)}: normality is {d.jarque_bera_p < 0.05 ? "rejected, so a Student-t robustness check is warranted." : "not rejected."}</Interpret></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="Squared returns (volatility clustering)"><LineC data={sq} x="date" lines={[{ key: "sq", name: "r² (%²)", color: "#d1566b", width: 1 }]} /></Panel>
        <Panel title="Rolling 30-day volatility"><LineC data={sq.filter((r) => r.rv !== null)} x="date" lines={[{ key: "rv", name: "30d σ (%)", color: "#9b5cff" }]} /></Panel></div>
      <Panel title="By sub-period" className="mt-5"><Table head={["Period", "N", "Mean", "Std", "Skew", "Kurtosis", "Min", "Max"]} rows={Object.entries(per).map(([k, v]: any) => [k, v.n, f(v.mean, 4), f(v.std, 4), f(v.skewness, 2), f(v.kurtosis, 1), f(v.min, 2), f(v.max, 2)])} /></Panel>
      <Panel title="Why this matters" className="mt-5"><Eq>{"Volatility clustering: large |r| tends to follow large |r|, calm follows calm.\nThe squared-return chart shows bursts (2015-16, Mar-2020) separated by quiet spells, which is what GARCH-type models capture."}</Eq></Panel></>); }}</Gate>);
}
