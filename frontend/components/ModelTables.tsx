"use client";
import { Table, Badge } from "./ui";
import { f, pv } from "@/lib/api";

export const PNAME: Record<string, string> = { mu: "μ (mean)", omega: "ω (omega)", "alpha[1]": "α (alpha)", "beta[1]": "β (beta)", "gamma[1]": "γ (gamma)", nu: "ν (t d.o.f.)", eta: "η (t d.o.f.)", lambda: "λ" };

export function ParamTable({ m }: { m: any }) {
  if (!m || m.error) return <div className="text-sm text-bear">Model did not estimate: {m?.error}</div>;
  return (<>
    <Table head={["Parameter", "Estimate", "Std. error", "t-stat", "p-value", "95% CI"]} rows={m.params.map((p: any) => [PNAME[p.name] || p.name, f(p.estimate, 5), f(p.se, 5), f(p.t, 2), pv(p.p), `[${f(p.ci_low, 4)}, ${f(p.ci_high, 4)}]`])} />
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-silver/70"><span>LogLik <b className="font-mono text-white">{f(m.loglik, 2)}</b></span><span>AIC <b className="font-mono text-white">{f(m.aic, 2)}</b></span>
      <span>BIC <b className="font-mono text-white">{f(m.bic, 2)}</b></span><span>N <b className="font-mono text-white">{m.nobs}</b></span><span>Covariance: {m.cov_type}</span>
      <Badge ok={m.converged}>{m.converged ? "converged" : "CONVERGENCE FAILURE"}</Badge>{m.near_unit_root && <Badge ok={false}>near unit root</Badge>}</div>
    {m.warnings?.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-300">{m.warnings.map((w: string) => <li key={w}>{w}</li>)}</ul>}
  </>);
}

export function DiagTable({ m }: { m: any }) {
  const d = m.diagnostics;
  const rows: any[][] = [
    ...d.ljung_box_z.map((x: any) => [`Ljung-Box z, lag ${x.lags}`, f(x.q_stat, 2), pv(x.p_value), x.p_value < 0.05 ? "autocorrelation remains" : "adequate"]),
    ...d.ljung_box_z2.map((x: any) => [`Ljung-Box z², lag ${x.lags}`, f(x.q_stat, 2), pv(x.p_value), x.p_value < 0.05 ? "ARCH structure remains" : "adequate"]),
    [`ARCH-LM on z, lag ${d.arch_lm_z.lags}`, f(d.arch_lm_z.lm_statistic, 2), pv(d.arch_lm_z.p_value), d.clustering_remaining_5pct ? "clustering remains" : "adequate"],
  ];
  return (<><Table head={["Diagnostic (standardised residuals)", "Statistic", "p-value", "Reading (5%)"]} rows={rows} />
    <div className="mt-2 text-xs text-silver/60">z: mean {f(d.mean, 3)}, variance {f(d.variance, 3)}, skew {f(d.skewness, 2)}, excess kurtosis {f(d.excess_kurtosis, 2)}</div></>);
}
