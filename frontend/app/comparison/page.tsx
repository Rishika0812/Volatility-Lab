"use client";
import { Gate, Panel, PageHeader, Table, Interpret, Badge } from "@/components/ui";
import { LineC } from "@/components/charts";
import { DiagTable } from "@/components/ModelTables";
import { f, pv } from "@/lib/api";

export default function Page() {
  return (<Gate>{({ R, series }) => { const C = R.comparison, F = R.forecast; const best = (k: string) => Math.min(...C.map((c: any) => c[k]));
    const full = R.models.full.models;
    return (<>
      <PageHeader scene="comparison" kicker="Page 9 · Model comparison" title="GARCH vs EGARCH">Relative fit, residual adequacy and out-of-sample accuracy: three different questions.</PageHeader>
      <Panel title="In-sample fit (full sample)"><Table head={["Model", "k", "Log-likelihood", "AIC", "BIC", "LB z (10) p", "LB z² (10) p", "ARCH-LM z p", "Converged"]} rows={C.map((c: any) => [c.model.replace("_", " · "), c.k_params, f(c.loglik, 2), <span key="a" className={c.aic === best("aic") ? "text-bull" : ""}>{f(c.aic, 2)}</span>, <span key="b" className={c.bic === best("bic") ? "text-bull" : ""}>{f(c.bic, 2)}</span>, pv(c.lb_z_10_p), pv(c.lb_z2_10_p), pv(c.arch_lm_z_p), <Badge key="c" ok={c.converged}>{String(c.converged)}</Badge>])} />
        <div className="mt-3 grid gap-3 md:grid-cols-2"><Interpret>Lowest AIC: <b>{R.findings.lowest_aic}</b> · lowest BIC: <b>{R.findings.lowest_bic}</b> (green).</Interpret>
          <Interpret tone="warn"><b>Why this does not prove the hypothesis:</b> information criteria compare overall likelihood fit penalised for parameters. A better-fitting EGARCH could owe its advantage to its log-variance form or to magnitude effects, not to γ. The hypothesis is tested by the significance and sign of γ. Also, GARCH and EGARCH are non-nested, so no likelihood-ratio test is applied.</Interpret></div></Panel>
      <div className="mt-5 grid gap-5 lg:grid-cols-2"><Panel title="GARCH(1,1) residual diagnostics"><DiagTable m={full.GARCH_normal} /></Panel><Panel title="EGARCH(1,1) residual diagnostics"><DiagTable m={full.EGARCH_normal} /></Panel></div>
      <Panel title="Conditional volatility: GARCH vs EGARCH" className="mt-5"><LineC data={series.filter((r) => r.garch_vol !== null)} x="date" lines={[{ key: "garch_vol", name: "GARCH", color: "#4f8bff" }, { key: "egarch_vol", name: "EGARCH", color: "#d1566b" }]} height={300} /></Panel>
      <Panel title={`Out-of-sample forecasts · estimation < ${F.split_date} (${F.n_train} obs) · test ${F.n_test} obs`} className="mt-5">
        <p className="mb-3 text-sm text-silver/70">{F.scheme}; parameters re-estimated every {F.refit_every_days} trading days using only data before each block (no look-ahead). Lower loss is better.</p>
        {Object.values(F.proxies).map((p: any) => (<div key={p.label} className="mb-4"><div className="mb-1 text-xs uppercase tracking-widest text-silver/60">Volatility proxy: {p.label}</div>
          <Table head={["Forecast", "MSE (variance)", "QLIKE", "MAE (variance)"]} rows={[["GARCH(1,1)", ...[p.losses.garch_var.MSE, p.losses.garch_var.QLIKE, p.losses.garch_var.MAE_var].map((v: number) => f(v, 4))], ["EGARCH(1,1)", ...[p.losses.egarch_var.MSE, p.losses.egarch_var.QLIKE, p.losses.egarch_var.MAE_var].map((v: number) => f(v, 4))], ["Historical variance (benchmark)", ...[p.losses.hist_var.MSE, p.losses.hist_var.QLIKE, p.losses.hist_var.MAE_var].map((v: number) => f(v, 4))]]} />
          <div className="mt-1 text-xs text-silver/70">Diebold-Mariano on QLIKE (GARCH − EGARCH, NW-5): mean diff {f(p.dm_garch_minus_egarch_qlike.mean_diff, 4)}, DM = {f(p.dm_garch_minus_egarch_qlike.dm_stat, 2)}, p = {pv(p.dm_garch_minus_egarch_qlike.p_value)} → {p.dm_garch_minus_egarch_qlike.p_value < 0.05 ? "significant difference" : "no statistically significant difference in forecast accuracy"}.</div></div>))}
        <Interpret>{F.note} Out-of-sample accuracy and the in-sample significance of γ can disagree: a model can contain a real asymmetry yet forecast no better when the asymmetry is small relative to forecast noise.</Interpret></Panel></>); }}</Gate>);
}
