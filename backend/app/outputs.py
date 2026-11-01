"""Persistence, Excel workbook (16 sheets), statistical report. All values come from engine results."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from . import engine

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR, OUT_DIR = ROOT / "data", ROOT / "output"
UPLOAD_PATH = DATA_DIR / "uploaded.csv"
DEFAULT_CSV = DATA_DIR / "Nifty_50_Historical_Data.csv"
XLSX_NAME = "Asymmetric_Volatility_Research_Results.xlsx"


def jsonable(o):
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if (math.isnan(o) or math.isinf(o)) else float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    if isinstance(o, (pd.Timestamp,)):
        return o.strftime("%Y-%m-%d")
    return o


def persist(results: dict, frames: dict):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    s = frames["series"].copy()
    series = {"columns": list(s.columns), "rows": jsonable([[(None if (isinstance(v, float) and math.isnan(v)) else (round(v, 5) if isinstance(v, float) else v)) for v in row] for row in s.itertuples(index=False)])}
    (OUT_DIR / "series.json").write_text(json.dumps(series))
    (OUT_DIR / "results.json").write_text(json.dumps(jsonable(results)))
    c = frames["clean"].copy()
    c["Date"] = c["Date"].dt.strftime("%Y-%m-%d")
    c.to_csv(OUT_DIR / "cleaned_data.csv", index=False)
    frames["raw"].to_csv(OUT_DIR / "raw_data.csv", index=False)
    export_csv = c[c["InPrimarySample"]][["Date", "Open", "High", "Low", "Close", "Volume", "ChangePct_src", "Return", "Flags"]]
    export_csv.to_csv(OUT_DIR / "cleaned_primary_sample.csv", index=False)
    build_excel(results, frames, OUT_DIR / XLSX_NAME)
    (OUT_DIR / "statistical_report.md").write_text(build_report(results), encoding="utf-8")


# --------------------------------------------------------------------------- Excel
def _flat_models(results):
    rows = []
    for pk, per in results["models"].items():
        for mk, m in per["models"].items():
            if "error" in m:
                rows.append({"Period": per["label"], "Model": mk, "Error": m["error"]})
                continue
            for p in m["params"]:
                rows.append({"Period": per["label"], "Model": mk, "Parameter": p["name"], "Estimate": p["estimate"], "Std.Error": p["se"], "t-stat": p["t"],
                             "p-value": p["p"], "CI 2.5%": p["ci_low"], "CI 97.5%": p["ci_high"], "LogLik": m["loglik"], "AIC": m["aic"], "BIC": m["bic"],
                             "N": m["nobs"], "Converged": m["converged"], "Warnings": " | ".join(m["warnings"])})
    return pd.DataFrame(rows)


def build_excel(results: dict, frames: dict, path: Path):
    s, clean, raw, fc = frames["series"], frames["clean"], frames["raw"], frames["forecast"]
    cv = frames["full_models_cv"]
    full = results["models"]["full"]["models"]
    with pd.ExcelWriter(path, engine="xlsxwriter") as xw:
        wb = xw.book
        hdr = wb.add_format({"bold": True, "bg_color": "#0B1B3F", "font_color": "#FFFFFF", "border": 1, "text_wrap": True, "valign": "vcenter"})
        title = wb.add_format({"bold": True, "font_size": 14, "font_color": "#1F3FBF"})
        note = wb.add_format({"italic": True, "font_color": "#555555", "text_wrap": False})
        num4 = wb.add_format({"num_format": "0.0000"})
        num2 = wb.add_format({"num_format": "#,##0.00"})

        def put(name, df, ttl, nt="", start=3):
            df = df.copy()
            df.to_excel(xw, sheet_name=name, index=False, startrow=start)
            ws = xw.sheets[name]
            ws.write(0, 0, ttl, title)
            ws.write(1, 0, nt, note)
            for i, c in enumerate(df.columns):
                ws.write(start, i, c, hdr)
                w = max(12, min(45, int(df[c].astype(str).str.len().quantile(0.9)) + 2 if len(df) else 12, len(str(c)) + 8))
                ws.set_column(i, i, max(w, len(str(c)) + 2), num4 if df[c].dtype.kind == "f" else None)
            ws.freeze_panes(start + 1, 0)
            return ws

        put("Raw_Data", raw, "Raw uploaded data (unaltered, original order)", "All values are text exactly as in the uploaded CSV.")
        q = results["quality"]
        qrows = [("Rows uploaded", q["rows_uploaded"]), ("Date range", " to ".join(q["date_range_uploaded"])), ("Source order", q["source_order"]),
                 ("Unparseable dates", q["unparseable_dates"]), ("Duplicate dates", ", ".join(q["duplicate_dates"]) or "none"),
                 ("Duplicates removed for estimation", q["duplicate_rows_removed_for_estimation"]),
                 ("Invalid / non-positive closes", ", ".join(q["invalid_or_nonpositive_close"]) or "none"),
                 ("Volume rows with B suffix", q["volume_rows_with_B_suffix"]), ("Primary-sample price observations", q["primary_sample"]["price_observations"]),
                 ("Rows excluded after 2025 (2026)", q["excluded_after_sample"]), ("Returns computed", q["return_validation"]["returns_computed"]),
                 ("Mean |log return - source Change %| (pp)", q["return_validation"]["mean_abs_diff_log_vs_source_change_pp"]),
                 ("Max |log return - source Change %| (pp)", q["return_validation"]["max_abs_diff_log_vs_source_change_pp"])]
        qrows += [(f"Missing: {k}", v) for k, v in q["missing_by_column"].items()] + [(f"Suspicious: {k}", v) for k, v in q["suspicious_counts"].items()]
        put("Data_Quality", pd.DataFrame(qrows, columns=["Check", "Result"]).astype({"Result": str}), "Data-quality report", "Suspicious observations are flagged, never deleted. Flagged rows are listed in Cleaned_Data (Flags column).")
        c2 = clean.copy()
        c2["Date"] = c2["Date"].dt.strftime("%Y-%m-%d")
        put("Cleaned_Data", c2[["Date", "Open", "High", "Low", "Close", "Volume", "ChangePct_src", "ReturnCheck_diff_pp", "Return", "InPrimarySample", "Flags"]],
            "Cleaned data (all rows, oldest to newest)", "Volume in shares/units as parsed (M=1e6, B=1e9). Return in percent. InPrimarySample=FALSE rows (2026) are excluded from estimation.")

        # Daily_Returns with live formulas
        ds = s.reset_index(drop=True)
        ws = xw.sheets["Cleaned_Data"]
        dfr = pd.DataFrame({"Date": ds["date"], "Close": ds["close"]})
        dfr.to_excel(xw, sheet_name="Daily_Returns", index=False, startrow=3)
        ws = xw.sheets["Daily_Returns"]
        ws.write(0, 0, "Daily log returns: r(t) = 100 x ln(P(t)/P(t-1))  [percent]", title)
        ws.write(1, 0, "Return column uses live Excel formulas on the closing prices. First observation is blank (no prior close).", note)
        for i, h in enumerate(["Date", "Close", "LogReturn_%", "SourceChange_%", "Diff_pp (simple-source)", "SquaredReturn"]):
            ws.write(3, i, h, hdr)
        src = clean.set_index(clean["Date"].dt.strftime("%Y-%m-%d"))["ChangePct_src"]
        for i in range(len(ds)):
            r = 4 + i
            xr = r + 1
            ret = ds["ret"].iloc[i]
            if i > 0:
                ws.write_formula(r, 2, f"=100*LN(B{xr}/B{xr-1})", num4, ret)
                ws.write_formula(r, 5, f"=C{xr}^2", num4, ret ** 2)
                ws.write_number(r, 3, float(src[ds["date"].iloc[i]]), num4)
                ws.write_formula(r, 4, f"=(B{xr}/B{xr-1}-1)*100-D{xr}", num4, float(100 * (ds['close'].iloc[i] / ds['close'].iloc[i - 1] - 1) - src[ds['date'].iloc[i]]))
        ws.set_column(0, 5, 16)
        ws.freeze_panes(4, 0)
        last = 4 + len(ds)

        d = results["descriptive"]
        ws = xw.book.add_worksheet("Descriptive_Statistics")
        xw.sheets["Descriptive_Statistics"] = ws
        ws.write(0, 0, "Descriptive statistics of daily log returns (percent)", title)
        ws.write(1, 0, "Column B: Python (scipy). Column C: live Excel formula on Daily_Returns for cross-checking (sample std, ddof=1). Kurtosis = raw (normal = 3).", note)
        for i, h in enumerate(["Statistic", "Python value", "Excel check"]):
            ws.write(3, i, h, hdr)
        rng = f"Daily_Returns!$C$6:$C${last}"
        items = [("Observations", d["n"], f"=COUNT({rng})"), ("Mean", d["mean"], f"=AVERAGE({rng})"), ("Median", d["median"], f"=MEDIAN({rng})"),
                 ("Std. deviation", d["std"], f"=STDEV({rng})"), ("Minimum", d["min"], f"=MIN({rng})"), ("Maximum", d["max"], f"=MAX({rng})"),
                 ("Skewness (biased, scipy)", d["skewness"], None), ("Kurtosis (raw)", d["kurtosis"], None), ("Excess kurtosis", d["excess_kurtosis"], None),
                 ("Jarque-Bera", d["jarque_bera"], None), ("Jarque-Bera p-value", d["jarque_bera_p"], None),
                 ("Positive days", d["positive_days"], f'=COUNTIF({rng},">0")'), ("Negative days", d["negative_days"], f'=COUNTIF({rng},"<0")'),
                 ("Average positive return", d["avg_positive"], f'=AVERAGEIF({rng},">0")'), ("Average negative return", d["avg_negative"], f'=AVERAGEIF({rng},"<0")'),
                 ("Annualised volatility (%)", d["annualised_vol_pct"], f"=STDEV({rng})*SQRT(252)")]
        for i, (n, v, f) in enumerate(items):
            ws.write(4 + i, 0, n)
            ws.write_number(4 + i, 1, v, num4)
            if f:
                ws.write_formula(4 + i, 2, f, num4, v)
        ws.set_column(0, 2, 28)

        a = results["adf"]
        put("Stationarity_ADF", pd.DataFrame([("ADF statistic", a["statistic"]), ("p-value", a["p_value"]), ("Used lags (AIC)", a["used_lags"]), ("Observations", a["nobs"])]
                                             + [(f"Critical value {k}", v) for k, v in a["critical_values"].items()] + [("Reject unit root at 5%", a["reject_null_5pct"]), ("Interpretation", a["interpretation"])],
                                             columns=["Item", "Value"]).astype({"Value": str}), "Augmented Dickey-Fuller test on log returns", "H0: unit root. Regression: constant; lag length by AIC.")
        put("ARCH_LM", pd.DataFrame(results["arch_lm"]), "Engle ARCH-LM test on mean-equation residuals (r - mean)", "H0: no ARCH effects. df = number of lags.")
        gdf = _flat_models(results)
        put("GARCH_Results", gdf[gdf["Model"].str.startswith("GARCH")], "GARCH(1,1) estimates by period and distribution", "sigma2(t)=omega+alpha*eps2(t-1)+beta*sigma2(t-1). Robust SEs. Returns in percent, variance in %^2.")
        put("EGARCH_Results", gdf[gdf["Model"].str.startswith("EGARCH")], "EGARCH(1,1) estimates by period and distribution",
            "ln sigma2(t)=omega+beta*ln sigma2(t-1)+alpha(|z|-E|z|)+gamma*z(t-1). gamma<0 and significant => negative shocks raise volatility more.")
        ix = pd.Index(s["date"])
        sr = pd.DataFrame({"Date": ix, "Return_%": s["ret"].values})
        sr["GARCH_normal_CondVol"] = s["garch_vol"].values
        sr["EGARCH_normal_CondVol"] = s["egarch_vol"].values
        mu = {k: next(p["estimate"] for p in full[k]["params"] if p["name"] == "mu") for k in ("GARCH_normal", "EGARCH_normal")}
        sr["GARCH_StdResid"] = (s["ret"].values - mu["GARCH_normal"]) / s["garch_vol"].values
        sr["EGARCH_StdResid"] = (s["ret"].values - mu["EGARCH_normal"]) / s["egarch_vol"].values
        put("Standardised_Residuals", sr.iloc[1:], "Standardised residuals z(t) = (r - mu)/sigma(t), full sample, normal innovations", "Used for Ljung-Box and ARCH-LM diagnostics.")
        comp = pd.DataFrame(results["comparison"])
        put("Model_Comparison", comp, "GARCH vs EGARCH (full sample)", "Lower AIC/BIC = better relative fit. Not a test of the asymmetry hypothesis.")
        ws = xw.sheets["Model_Comparison"]
        r0 = len(comp) + 7
        ws.write(r0, 0, "Out-of-sample forecast losses (lower is better)", title)
        k = 0
        for pk, pv in results["forecast"]["proxies"].items():
            for m, l in pv["losses"].items():
                ws.write_row(r0 + 2 + k, 0, [pv["label"], m, l["MSE"], l["QLIKE"], l["MAE_var"]])
                k += 1
        ws.write_row(r0 + 1, 0, ["Proxy", "Model", "MSE", "QLIKE", "MAE(var)"], hdr)
        rows = []
        for pk, per in results["models"].items():
            for mk, m in per["models"].items():
                if "error" in m:
                    continue
                P = {p["name"]: p for p in m["params"]}
                rows.append({"Period": per["label"], "N": per["nobs"], "Model": mk, "alpha": P["alpha[1]"]["estimate"], "beta": P["beta[1]"]["estimate"],
                             "alpha+beta (GARCH)": m["persistence"] if m["kind"] == "GARCH" else None, "gamma (EGARCH)": P["gamma[1]"]["estimate"] if "gamma[1]" in P else None,
                             "gamma p-value": P["gamma[1]"]["p"] if "gamma[1]" in P else None, "AIC": m["aic"], "BIC": m["bic"], "LogLik": m["loglik"],
                             "Mean cond. vol": m["cond_vol_mean"], "Max cond. vol": m["cond_vol_max"], "LB(10) z p": m["diagnostics"]["ljung_box_z"][0]["p_value"],
                             "LB(10) z^2 p": m["diagnostics"]["ljung_box_z2"][0]["p_value"], "ARCH-LM(10) z p": m["diagnostics"]["arch_lm_z"]["p_value"], "Converged": m["converged"]})
        rob = pd.DataFrame(rows)
        put("COVID_Robustness", rob[rob["Model"].str.endswith("normal")], "Sub-period robustness (normal innovations)", "Sub-period returns use prior-day closes, so each period's first return is included.")
        ws = xw.sheets["COVID_Robustness"]
        r0 = len(rob[rob["Model"].str.endswith("normal")]) + 7
        ws.write(r0, 0, "Wald z-tests for equality of EGARCH gamma between independent sub-samples (approximation)", title)
        gd = pd.DataFrame(results["gamma_diff_tests"])
        if len(gd):
            ws.write_row(r0 + 1, 0, list(gd.columns), hdr)
            for i, row in enumerate(gd.itertuples(index=False)):
                ws.write_row(r0 + 2 + i, 0, [str(v) if isinstance(v, str) else (bool(v) if isinstance(v, (bool, np.bool_)) else float(v)) for v in row])
        put("Student_t_Robustness", rob[rob["Model"].str.endswith("_t")], "Student-t innovation robustness", "Same specifications with Student's t errors; 'eta' is the degrees-of-freedom parameter in the model tables.")
        fx = fc.reset_index()
        fx["date"] = fx["date"].dt.strftime("%Y-%m-%d")
        put("Volatility_Forecasts", fx.rename(columns={"garch_var": "GARCH_var_forecast", "egarch_var": "EGARCH_var_forecast", "hist_var": "Hist_var_forecast", "proxy_sq": "Proxy_sq_return", "proxy_pk": "Proxy_Parkinson"}),
            "One-step-ahead variance forecasts (out-of-sample, expanding window)", f"Estimation < {engine.OOS_SPLIT}; re-estimated every {engine.REFIT_EVERY} trading days with data strictly before each block (no leakage). Units: %^2.")
        meth = [("Data", "Returns r(t)=100*ln(P(t)/P(t-1)) from closing prices. Sample 1 Jan 2015 - 31 Dec 2025. 2026 excluded."),
                ("ADF", "Tests unit root in returns; H0 non-stationary."), ("ARCH-LM", "Engle test of volatility clustering on mean residuals."),
                ("GARCH(1,1)", "sigma2(t)=omega+alpha*eps2(t-1)+beta*sigma2(t-1)"),
                ("EGARCH(1,1)", "ln sigma2(t)=omega+beta*ln sigma2(t-1)+alpha(|z(t-1)|-E|z|)+gamma*z(t-1)"),
                ("Hypothesis", "H0: gamma=0 (symmetry). H1: gamma<0 (negative shocks matter more). One-sided p reported alongside two-sided."),
                ("Robustness", "Sub-periods, Student-t errors, Wald test for gamma differences."),
                ("Forecasting", "Chronological split; QLIKE and MSE with squared-return and Parkinson proxies; Diebold-Mariano on QLIKE."),
                ("Caveat", "Lowest AIC/BIC does not prove the hypothesis. Statistical != economic significance. Simulations are model-implied.")]
        put("Methodology", pd.DataFrame(meth, columns=["Topic", "Description"]), "Methodology summary", "")
        xw.sheets["Methodology"].set_column(1, 1, 120)
        cd = s[["date", "close", "ret", "rv30", "garch_vol", "egarch_vol"]].rename(columns={"rv30": "rolling30_vol", "garch_vol": "GARCH_condvol", "egarch_vol": "EGARCH_condvol"})
        put("Charts_Data", cd, "Data behind the website charts", "Units: close in index points; returns and volatilities in percent (daily).")
        ws = xw.sheets["Charts_Data"]
        ch = wb.add_chart({"type": "line"})
        n = len(cd)
        for col, nm, colr in ((4, "GARCH cond. vol", "#3B6BFF"), (5, "EGARCH cond. vol", "#9B5CFF")):
            ch.add_series({"name": nm, "categories": ["Charts_Data", 4, 0, 3 + n, 0], "values": ["Charts_Data", 4, col, 3 + n, col], "line": {"width": 1, "color": colr}})
        ch.set_title({"name": "Conditional volatility (daily %)"})
        ch.set_size({"width": 900, "height": 360})
        ws.insert_chart("I4", ch)
        nic = pd.DataFrame(results["news_impact"])
        nic.to_excel(xw, sheet_name="Charts_Data", index=False, startrow=3, startcol=20)
        ws.write(2, 20, "News impact curves (variance, %^2)", title)


# --------------------------------------------------------------------------- report
def build_report(R: dict) -> str:
    d, f = R["descriptive"], R["findings"]
    L = ["# Asymmetric Volatility in the Indian Equity Market - Statistical Report", "",
         f"Generated: {R['meta']['generated_at']}", f"Sample: {R['meta']['sample']['start']} to {R['meta']['sample']['end']} ({R['meta']['sample']['observations_returns']} daily log returns, Nifty 50)", "",
         "## Hypothesis decision", f"**{f['hypothesis_decision']}**", "", "## Principal results"]
    L += [f"- {p}" for p in f["paragraphs"]]
    L += ["", "## Sub-period gamma (EGARCH, normal)"] + [f"- {p}" for p in f["period_gammas"]]
    L += ["", "## Formal tests of gamma differences"]
    for t in R["gamma_diff_tests"]:
        L.append(f"- [{t['dist']}] {t['a']} vs {t['b']}: diff = {t['diff']:.4f}, z = {t['z']:.2f}, p = {t['p_value']:.3g} ({'significant' if t['significant_5pct'] else 'not significant'})")
    L += ["", "## Model comparison (full sample)", "| Model | LogLik | AIC | BIC | Converged |", "|---|---|---|---|---|"]
    L += [f"| {c['model']} | {c['loglik']:.2f} | {c['aic']:.2f} | {c['bic']:.2f} | {c['converged']} |" for c in R["comparison"]]
    L += ["", "## Caveats"] + [f"- {c}" for c in f["caveats"]]
    return "\n".join(L)
