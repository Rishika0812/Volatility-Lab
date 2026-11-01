"use client";
import { Gate, Panel, PageHeader, Table, Interpret, Eq, Badge } from "@/components/ui";
import { CorrBars } from "@/components/charts";
import { f, pv } from "@/lib/api";

export default function Page() {
  return (<Gate>{({ R }) => { const a = R.adf, A = R.acf;
    return (<>
      <PageHeader scene="stationarity" kicker="Page 5 · Stationarity & ARCH tests" title="Is the series suitable for GARCH modelling?">Two prerequisites: returns should be stationary (ADF), and variance should be time-varying (ARCH-LM).</PageHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Augmented Dickey-Fuller test" right={<Badge ok={a.reject_null_5pct}>{a.reject_null_5pct ? "unit root rejected" : "not rejected"}</Badge>}>
          <Table head={["Item", "Value"]} rows={[["ADF statistic", f(a.statistic, 4)], ["p-value", pv(a.p_value)], ["Lags used (AIC)", a.used_lags], ["Observations", a.nobs], ...Object.entries(a.critical_values).map(([k, v]: any) => [`Critical value ${k}`, f(v, 4)])]} />
          <div className="mt-3"><Interpret tone={a.reject_null_5pct ? "good" : "warn"}>{a.interpretation}</Interpret></div><div className="mt-3 text-xs text-silver/60">H0: the series has a unit root (non-stationary). Regression with constant; lag order chosen by AIC.</div></Panel>
        <Panel title="ARCH-LM test (Engle, 1982)"><Table head={["Lags", "LM stat", "df", "p-value", "F-stat", "Decision"]} rows={R.arch_lm.map((x: any) => [x.lags, f(x.lm_statistic, 2), x.df, pv(x.p_value), f(x.f_statistic, 2), x.reject_null_5pct ? "ARCH effects present" : "none"])} />
          <div className="mt-3 space-y-2">{R.arch_lm.map((x: any) => <Interpret key={x.lags} tone={x.reject_null_5pct ? "good" : "warn"}>{x.interpretation}</Interpret>)}</div>
          <div className="mt-3"><Eq>{"ε(t) = r(t) − mean(r)\nRegress ε²(t) on ε²(t−1..t−q);  LM = T·R²  ~  χ²(q) under H0 (no ARCH)"}</Eq></div></Panel></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="ACF · returns"><CorrBars values={A.returns.acf} ci={A.ci95} /></Panel><Panel title="PACF · returns"><CorrBars values={A.returns.pacf} ci={A.ci95} /></Panel>
        <Panel title="ACF · squared returns"><CorrBars values={A.squared_returns.acf} ci={A.ci95} color="#d1566b" /></Panel><Panel title="PACF · squared returns"><CorrBars values={A.squared_returns.pacf} ci={A.ci95} color="#d1566b" /></Panel></div>
      <p className="mt-3 text-xs text-silver/60">Dashed lines: ±1.96/√n = ±{f(A.ci95, 4)} (approximate 95% bands under white noise). Returns show little autocorrelation, while squared returns remain autocorrelated for many lags, which is the signature of ARCH effects.</p></>); }}</Gate>);
}
