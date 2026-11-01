"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Panel, PageHeader, Eq, Interpret } from "@/components/ui";

const FLOW = [
  ["Upload CSV", "The Nifty 50 file (Date, Price, Open, High, Low, Vol., Change %) is read exactly as supplied and a copy is preserved."],
  ["Clean & validate", "Dates are parsed (DD-MM-YYYY), commas removed, volume suffix M/B converted, rows sorted oldest→newest. Missing values, duplicates, non-positive prices and suspicious points are flagged, never silently deleted."],
  ["Sample 2015–2025", "Only 1 Jan 2015 – 31 Dec 2025 enters estimation. 2026 rows are kept aside."],
  ["Log returns", "r(t) = 100·ln(P(t)/P(t−1)) from closing prices. The first return is blank. Compared against the source Change % as a validation check."],
  ["ADF & ARCH-LM", "ADF checks stationarity; Engle's ARCH-LM checks whether variance clusters. Both must pass for GARCH modelling to make sense."],
  ["GARCH(1,1)", "Symmetric benchmark: variance responds to squared shocks."],
  ["EGARCH(1,1)", "Adds the signed term γ·z. Test H₀: γ = 0 vs H₁: γ < 0."],
  ["Robustness", "Pre-COVID / COVID / post-COVID subsamples, Student-t errors, Wald tests for differences in γ."],
  ["Compare & forecast", "AIC/BIC, Ljung-Box, ARCH-LM on standardised residuals, chronological out-of-sample QLIKE/MSE."],
  ["Report", "Excel workbook (16 sheets), cleaned CSV, JSON results, statistical report."],
];
const TESTS = [["Augmented Dickey-Fuller", "Δy(t) = c + δ·y(t−1) + Σφ(i)Δy(t−i) + u(t). H₀: δ = 0 (unit root). Rejection ⇒ stationary returns."], ["Engle ARCH-LM", "Regress ε²(t) on its own lags; LM = T·R² ~ χ²(q). H₀: no ARCH."], ["Jarque-Bera", "JB = (T/6)(S² + (K−3)²/4). H₀: normality."], ["Ljung-Box", "Q = T(T+2)Σ ρ(k)²/(T−k). Applied to z (mean adequacy) and z² (variance adequacy)."], ["AIC / BIC", "AIC = 2k − 2lnL ; BIC = k·ln T − 2lnL. Relative fit only."], ["QLIKE", "L = ln h(t) + proxy(t)/h(t). Robust loss for variance forecasts; compared with Diebold-Mariano."], ["Wald z-test for γ", "z = (γ₁ − γ₂)/√(se₁² + se₂²) for independent sub-samples."]];

export default function Page() {
  const [i, setI] = useState(0);
  return (<><PageHeader scene="methodology" kicker="Page 11 · Methodology" title="How the research works">From raw CSV to hypothesis decision. Click a step.</PageHeader>
    <Panel title="Interactive research flowchart"><div className="flex flex-wrap items-center gap-2">{FLOW.map(([t], k) => (<div key={t} className="flex items-center gap-2"><motion.button whileHover={{ scale: 1.05 }} onClick={() => setI(k)} className={`rounded-lg border px-3 py-2 text-sm ${i === k ? "border-violet bg-violet/20 text-white" : "border-edge bg-navy-900 text-silver"}`}>{k + 1}. {t}</motion.button>{k < FLOW.length - 1 && <span className="text-volt">→</span>}</div>))}</div>
      <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-volt/40 bg-volt/5 p-4 text-sm"><b className="text-white">{FLOW[i][0]}.</b> {FLOW[i][1]}</motion.div></Panel>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Models & variables"><Eq>{"r(t) = 100·ln(P(t)/P(t−1))                 (daily log return, %)\nr(t) = μ + ε(t),   ε(t) = σ(t)·z(t)            (mean equation)\n\nGARCH:  σ²(t) = ω + α·ε²(t−1) + β·σ²(t−1)\nEGARCH: ln σ²(t) = ω + β·ln σ²(t−1) + α(|z(t−1)| − E|z|) + γ·z(t−1)\n         z(t) = ε(t)/σ(t),  E|z| = √(2/π) for N(0,1)"}</Eq>
        <ul className="mt-3 space-y-1 text-sm text-silver/80"><li><b>P(t)</b> closing price · <b>r(t)</b> return · <b>μ</b> mean · <b>ε(t)</b> unexpected return (shock) · <b>σ(t)</b> conditional standard deviation · <b>z(t)</b> standardised shock.</li><li><b>ω, α, β</b> as defined on the GARCH page; <b>γ</b> asymmetry; <b>α+β</b> persistence; half-life = ln 0.5 / ln(persistence).</li></ul></Panel>
      <Panel title="Hypotheses & decision rule"><Eq>{"H0: γ = 0   (positive and negative shocks of equal size have the same effect)\nH1: γ < 0   (negative shocks have the larger effect)"}</Eq><p className="mt-3 text-sm text-silver/80">We report the estimate, robust standard error, t-statistic, two-sided and one-sided p-values and a 95% interval. A negative γ that is not statistically significant is <i>not</i> evidence of asymmetry; a positive significant γ would contradict H₁.</p></Panel></div>
    <Panel title="Why each test is used" className="mt-5"><div className="grid gap-3 md:grid-cols-2">{TESTS.map(([a, b]) => <div key={a} className="rounded-xl border border-edge p-3"><div className="font-semibold text-white">{a}</div><div className="mt-1 font-mono text-xs text-silver/75">{b}</div></div>)}</div></Panel>
    <Panel title="In plain English (for beginners)" className="mt-5"><div className="space-y-3 text-sm text-silver/85"><p><b>Volatility</b> is how wildly prices swing. It is not constant: calm months are followed by turbulent ones (volatility <i>clustering</i>).</p>
      <p><b>GARCH</b> says: today&apos;s expected swing size depends on yesterday&apos;s surprise and yesterday&apos;s expected swing. But it only looks at the <i>size</i> of the surprise, so a 3% jump up and a 3% drop count the same.</p>
      <p><b>EGARCH</b> adds a dial, γ, that can respond to the <i>direction</i> of the surprise. If γ is negative, bad news makes tomorrow riskier than equally big good news does. Whether that dial is really different from zero is decided by a statistical test, not by looking at the number.</p>
      <p><b>The 3D simulator</b> takes the estimated dials, applies a +k and a −k shock, and shows what each model implies for the following days. It is a what-if on the model, not a prediction of the market.</p></div>
      <div className="mt-4"><Interpret>Reproducibility: estimation uses deterministic optimisation (no random numbers); software versions are recorded in results.json → meta.python_libs.</Interpret></div></Panel></>);
}
