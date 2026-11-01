"use client";
import { Bar, BarChart, CartesianGrid, Cell, ErrorBar, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { Gate, Panel, PageHeader, Table, Interpret, Badge } from "@/components/ui";
import { f, pv } from "@/lib/api";

const KEYS = ["pre", "covid", "post", "full"] as const;
const P = (m: any, n: string) => m?.params?.find((p: any) => p.name === n);

export default function Page() {
  return (<Gate>{({ R }) => { const M = R.models;
    const row = (k: string, dist: string) => { const g = M[k].models[`GARCH_${dist}`], e = M[k].models[`EGARCH_${dist}`]; const ga = P(g, "alpha[1]"), gb = P(g, "beta[1]"), eg = P(e, "gamma[1]");
      return [M[k].label, M[k].nobs, f(ga?.estimate, 4), f(gb?.estimate, 4), f(g?.persistence, 4), f(eg?.estimate, 4), pv(eg?.p), f(g?.aic, 1) + " / " + f(e?.aic, 1), f(g?.bic, 1) + " / " + f(e?.bic, 1), f(g?.loglik, 1) + " / " + f(e?.loglik, 1), `${f(g?.cond_vol_mean, 3)} / ${f(e?.cond_vol_mean, 3)}`,
        <span key="d" className="flex gap-1"><Badge ok={!!g?.converged && !!e?.converged}>{g?.converged && e?.converged ? "ok" : "check"}</Badge>{(g?.near_unit_root || e?.near_unit_root) && <Badge ok={false}>near unit root</Badge>}</span>]; };
    const head = ["Period", "N", "GARCH α", "GARCH β", "α+β", "EGARCH γ", "γ p-value", "AIC (G/E)", "BIC (G/E)", "LogLik (G/E)", "Mean σ (G/E)", "Status"];
    const chart = KEYS.flatMap((k) => ["normal", "t"].map((d) => ({ name: `${M[k].label.split(" (")[0]} · ${d === "t" ? "t" : "N"}`, gamma: P(M[k].models[`EGARCH_${d}`], "gamma[1]")?.estimate, err: 1.96 * (P(M[k].models[`EGARCH_${d}`], "gamma[1]")?.se || 0), d })));
    return (<>
      <PageHeader scene="robustness" kicker="Page 8 · COVID & robustness" title="Does asymmetry survive across regimes and error distributions?">Separate estimates for pre-COVID, COVID and post-COVID, with normal and Student-t innovations.</PageHeader>
      <Panel title="Sub-period estimates · normal innovations"><Table head={head} rows={KEYS.map((k) => row(k, "normal"))} /></Panel>
      <Panel title="Sub-period estimates · Student-t innovations" className="mt-5"><Table head={head} rows={KEYS.map((k) => row(k, "t"))} /></Panel>
      <Panel title="EGARCH γ across periods (bars = estimate, whiskers = 95% CI)" className="mt-5"><ResponsiveContainer width="100%" height={320}><BarChart data={chart} margin={{ left: 0, right: 12, top: 12 }}><CartesianGrid stroke="#ffffff10" />
        <XAxis dataKey="name" stroke="#6f7fa8" fontSize={11} interval={0} angle={-15} height={60} /><YAxis stroke="#6f7fa8" fontSize={11} width={46} /><ReferenceLine y={0} stroke="#9aa7cc" /><Tooltip contentStyle={{ background: "#0b1330", border: "1px solid #2a3a6a" }} formatter={(v: number) => v.toFixed(4)} />
        <Bar dataKey="gamma" isAnimationActive={false}>{chart.map((c, i) => <Cell key={i} fill={c.d === "t" ? "#9b5cff" : "#3b6bff"} />)}<ErrorBar dataKey="err" stroke="#ffd27a" width={4} /></Bar></BarChart></ResponsiveContainer>
        <p className="text-xs text-silver/60">Blue = normal, violet = Student-t. Overlapping intervals suggest no clear difference, but only the formal test below can support a claim of change.</p></Panel>
      <Panel title="Formal tests of γ equality between sub-periods (Wald z-test, independent samples)" className="mt-5"><Table head={["Error dist.", "Comparison", "γ A", "γ B", "Diff", "z", "p-value", "Significant (5%)", "Caution"]} rows={R.gamma_diff_tests.map((t: any) => [t.dist === "t" ? "Student-t" : "Normal", `${t.a.split(" (")[0]} vs ${t.b.split(" (")[0]}`, f(t.gamma_a), f(t.gamma_b), f(t.diff), f(t.z, 2), pv(t.p_value), t.significant_5pct ? "yes" : "no", t.caution || ""])} />
        <div className="mt-3"><Interpret tone="warn">Differences across periods are described as significant <b>only</b> where this test says so. The test treats sub-samples as independent and uses asymptotic standard errors; the 2020 sample has only {M.covid.nobs} observations and some fits sit close to a unit root (flagged), which makes those comparisons unreliable.</Interpret></div></Panel>
      <Panel title="Diagnostics by period (normal EGARCH): Ljung-Box z² (10) / ARCH-LM z (10), p-values" className="mt-5"><Table head={["Period", "GARCH LB z²", "GARCH ARCH-LM", "EGARCH LB z²", "EGARCH ARCH-LM"]} rows={KEYS.map((k) => { const g = M[k].models.GARCH_normal.diagnostics, e = M[k].models.EGARCH_normal.diagnostics; return [M[k].label, pv(g.ljung_box_z2[0].p_value), pv(g.arch_lm_z.p_value), pv(e.ljung_box_z2[0].p_value), pv(e.arch_lm_z.p_value)]; })} /></Panel></>); }}</Gate>);
}
