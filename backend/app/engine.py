"""
VOLATILITY LAB - econometric engine.

All statistics are computed with statsmodels / arch / scipy. Nothing here is mocked.
Units: returns are in PERCENT (100 * ln(P_t / P_{t-1})); variances in %^2.
"""
from __future__ import annotations

import io
import math
import re
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from arch import arch_model
from scipy import stats
from statsmodels.stats.diagnostic import acorr_ljungbox, het_arch
from statsmodels.tsa.stattools import acf, adfuller, pacf

SAMPLE_START, SAMPLE_END = "2015-01-01", "2025-12-31"
OOS_SPLIT = "2023-01-01"          # chronological split: estimate < split, test >= split
REFIT_EVERY = 21                  # trading days between re-estimations in the forecast study
C_NORMAL = math.sqrt(2.0 / math.pi)  # E|z| for standard normal (used by arch's EGARCH)
PERIODS = {
    "pre": ("Pre-COVID (2015-2019)", "2015-01-01", "2019-12-31"),
    "covid": ("COVID (2020)", "2020-01-01", "2020-12-31"),
    "post": ("Post-COVID (2021-2025)", "2021-01-01", "2025-12-31"),
    "full": ("Full sample (2015-2025)", SAMPLE_START, SAMPLE_END),
}


# --------------------------------------------------------------------------- parsing
def parse_volume(s):
    """'328.56M' -> 328.56e6 ; 'B' = 1e9 ; 'K' = 1e3. Missing / '-' -> NaN."""
    if s is None or (isinstance(s, float) and np.isnan(s)):
        return np.nan
    s = str(s).strip().replace(",", "")
    if s in ("", "-", "nan"):
        return np.nan
    m = re.fullmatch(r"([\d.]+)\s*([KMB]?)", s, re.I)
    if not m:
        return np.nan
    return float(m.group(1)) * {"": 1, "K": 1e3, "M": 1e6, "B": 1e9}[m.group(2).upper()]


def _num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.replace("%", "", regex=False).str.strip(), errors="coerce")


def read_raw(source) -> pd.DataFrame:
    """Read the uploaded CSV exactly as provided (all strings, original order preserved)."""
    if isinstance(source, (bytes, bytearray)):
        source = io.BytesIO(source)
    raw = pd.read_csv(source, dtype=str, encoding="utf-8-sig", keep_default_na=False, na_values=[""])
    raw.columns = [c.strip() for c in raw.columns]
    need = ["Date", "Price", "Open", "High", "Low", "Vol.", "Change %"]
    missing = [c for c in need if c not in raw.columns]
    if missing:
        raise ValueError(f"CSV is missing required columns: {missing}. Found: {list(raw.columns)}")
    return raw[need]


# --------------------------------------------------------------------------- cleaning
def clean_data(raw: pd.DataFrame):
    """Return (cleaned_df sorted oldest->newest with flags, data-quality report dict)."""
    df = raw.copy()
    df["Date"] = pd.to_datetime(df["Date"], format="%d-%m-%Y", errors="coerce")
    for c in ["Price", "Open", "High", "Low"]:
        df[c] = _num(df[c])
    df["Volume"] = df["Vol."].map(parse_volume)
    df["ChangePct_src"] = _num(df["Change %"])
    src_b = int(df["Vol."].astype(str).str.upper().str.endswith("B").sum())
    src_order_desc = bool(df["Date"].is_monotonic_decreasing)
    df = df.drop(columns=["Vol.", "Change %"]).rename(columns={"Price": "Close"})

    q = {"rows_uploaded": int(len(df)), "columns": list(raw.columns)}
    q["missing_by_column"] = {c: int(v) for c, v in raw.isna().sum().items()}
    q["unparseable_dates"] = int(df["Date"].isna().sum())
    dup_mask = df["Date"].duplicated(keep=False) & df["Date"].notna()
    q["duplicate_dates"] = [d.strftime("%Y-%m-%d") for d in sorted(df.loc[dup_mask, "Date"].unique())]
    q["source_order"] = "newest-first (re-sorted oldest->newest)" if src_order_desc else "mixed/ascending (sorted oldest->newest)"
    q["volume_rows_with_B_suffix"] = src_b

    df = df[df["Date"].notna()].sort_values("Date", kind="stable")
    # duplicates: keep the last record per date for estimation, but report them (none expected)
    n_before = len(df)
    df = df.drop_duplicates("Date", keep="last").reset_index(drop=True)
    q["duplicate_rows_removed_for_estimation"] = int(n_before - len(df))

    bad_px = (df["Close"].isna()) | (df["Close"] <= 0)
    q["invalid_or_nonpositive_close"] = [d.strftime("%Y-%m-%d") for d in df.loc[bad_px, "Date"]]

    # suspicious observations (FLAGGED ONLY - never deleted)
    flags = pd.Series("", index=df.index, dtype=object)

    def flag(mask, text):
        flags.loc[mask] = flags.loc[mask] + text + "; "
        return int(mask.sum())

    tol = 1e-6
    sus = {}
    sus["high_below_low"] = flag(df["High"] < df["Low"], "High<Low")
    sus["close_outside_high_low"] = flag((df["Close"] > df["High"] + tol) | (df["Close"] < df["Low"] - tol), "Close outside H/L")
    sus["open_outside_high_low"] = flag((df["Open"] > df["High"] + tol) | (df["Open"] < df["Low"] - tol), "Open outside H/L")
    gap = df["Date"].diff().dt.days
    sus["calendar_gap_over_5_days"] = flag(gap > 5, "Gap>5d")
    sus["missing_volume"] = flag(df["Volume"].isna(), "Vol missing")
    ret_all = 100 * np.log(df["Close"] / df["Close"].shift(1))
    sus["abs_return_over_5pct"] = flag(ret_all.abs() > 5, "|ret|>5%")
    sd = ret_all.std()
    sus["abs_return_over_6_sd"] = flag(ret_all.abs() > 6 * sd, "|ret|>6sd")
    # Change % validation: simple % change from close vs. source Change %
    simple = 100 * (df["Close"] / df["Close"].shift(1) - 1)
    mism = (simple - df["ChangePct_src"]).abs()
    sus["change_pct_mismatch_over_0.05pp"] = flag(mism > 0.05, "Change% mismatch")
    q["suspicious_counts"] = sus
    df["ReturnCheck_diff_pp"] = (simple - df["ChangePct_src"])
    df["Flags"] = flags.str.rstrip("; ")
    q["suspicious_observations"] = [
        {"date": r.Date.strftime("%Y-%m-%d"), "close": float(r.Close), "flags": r.Flags}
        for r in df[df["Flags"] != ""].itertuples()
    ][:400]
    q["note"] = "Suspicious observations are flagged, never deleted. Large |returns| (e.g. March 2020) are genuine market events."

    # sample split
    in_s = (df["Date"] >= SAMPLE_START) & (df["Date"] <= SAMPLE_END)
    df["InPrimarySample"] = in_s
    q["primary_sample"] = {"start": SAMPLE_START, "end": SAMPLE_END, "price_observations": int(in_s.sum())}
    q["excluded_after_sample"] = int((df["Date"] > SAMPLE_END).sum())
    q["excluded_before_sample"] = int((df["Date"] < SAMPLE_START).sum())
    q["date_range_uploaded"] = [df["Date"].min().strftime("%Y-%m-%d"), df["Date"].max().strftime("%Y-%m-%d")]
    q["observations_per_year"] = {int(k): int(v) for k, v in df["Date"].dt.year.value_counts().sort_index().items()}

    # log returns computed ONLY from the primary-sample closing prices; first one is blank
    s = df.loc[in_s & ~bad_px].copy()
    s["Return"] = 100 * np.log(s["Close"] / s["Close"].shift(1))
    df["Return"] = np.nan
    df.loc[s.index, "Return"] = s["Return"]
    rr = s["Return"].dropna()
    cmp_ = (s["Return"] - s["ChangePct_src"])
    q["return_validation"] = {
        "returns_computed": int(rr.size),
        "first_return_blank": bool(pd.isna(s["Return"].iloc[0])),
        "mean_abs_diff_log_vs_source_change_pp": float(cmp_.abs().mean()),
        "max_abs_diff_log_vs_source_change_pp": float(cmp_.abs().max()),
        "correlation_with_source_change": float(s["Return"].corr(s["ChangePct_src"])),
        "note": "Log return differs slightly from simple % change by construction (ln(1+x) vs x).",
    }
    return df, q


# --------------------------------------------------------------------------- descriptives & tests
def describe(r: pd.Series) -> dict:
    r = r.dropna()
    jb = stats.jarque_bera(r)
    pos, neg = r[r > 0], r[r < 0]
    return {
        "n": int(r.size), "mean": float(r.mean()), "median": float(r.median()), "std": float(r.std(ddof=1)),
        "min": float(r.min()), "max": float(r.max()), "skewness": float(stats.skew(r)),
        "excess_kurtosis": float(stats.kurtosis(r)), "kurtosis": float(stats.kurtosis(r) + 3),
        "jarque_bera": float(jb.statistic), "jarque_bera_p": float(jb.pvalue),
        "positive_days": int(pos.size), "negative_days": int(neg.size), "zero_days": int((r == 0).sum()),
        "avg_positive": float(pos.mean()), "avg_negative": float(neg.mean()),
        "annualised_vol_pct": float(r.std(ddof=1) * math.sqrt(252)),
    }


def adf_test(r: pd.Series) -> dict:
    stat, p, usedlag, nobs, crit, icbest = adfuller(r.dropna(), regression="c", autolag="AIC")
    rej = bool(p < 0.05)
    return {
        "statistic": float(stat), "p_value": float(p), "critical_values": {k: float(v) for k, v in crit.items()},
        "used_lags": int(usedlag), "nobs": int(nobs), "regression": "constant", "autolag": "AIC", "reject_null_5pct": rej,
        "interpretation": (
            f"The ADF statistic ({stat:.3f}) is {'below' if stat < crit['5%'] else 'above'} the 5% critical value ({crit['5%']:.3f}) "
            f"with p = {p:.4g}. The unit-root null is {'REJECTED: the log-return series is stationary, so mean/variance models can be applied.' if rej else 'NOT rejected: the series may be non-stationary; GARCH-type results should be treated with caution.'}"),
    }


def arch_lm(resid: pd.Series, lags=(5, 10)) -> list:
    out = []
    for L in lags:
        lm, lmp, f, fp = het_arch(resid.dropna(), nlags=L)
        out.append({
            "lags": L, "lm_statistic": float(lm), "p_value": float(lmp), "df": L, "f_statistic": float(f), "f_p_value": float(fp),
            "reject_null_5pct": bool(lmp < 0.05),
            "interpretation": (f"Engle's ARCH-LM test with {L} lags on mean-equation residuals (r - mean): LM = {lm:.2f}, p = {lmp:.4g}. "
                               + ("Null of no ARCH effects is rejected: conditional heteroskedasticity (volatility clustering) is present, which justifies GARCH-type models."
                                  if lmp < 0.05 else "No significant ARCH effects detected; GARCH-type modelling is not strongly justified.")),
        })
    return out


def acf_block(r: pd.Series, nlags=40) -> dict:
    r = r.dropna()
    n = r.size
    out = {"nlags": nlags, "ci95": float(1.96 / math.sqrt(n))}
    for name, x in (("returns", r), ("squared_returns", r ** 2)):
        out[name] = {"acf": [float(v) for v in acf(x, nlags=nlags, fft=True)[1:]],
                     "pacf": [float(v) for v in pacf(x, nlags=nlags, method="ywm")[1:]]}
    return out


def histogram(r: pd.Series, bins=70) -> dict:
    r = r.dropna()
    cnt, edges = np.histogram(r, bins=bins)
    mid = (edges[:-1] + edges[1:]) / 2
    w = edges[1] - edges[0]
    mu, sd = r.mean(), r.std(ddof=1)
    return {"bins": [{"x": float(m), "density": float(c / (r.size * w)), "count": int(c), "normal": float(stats.norm.pdf(m, mu, sd))} for m, c in zip(mid, cnt)]}


# --------------------------------------------------------------------------- GARCH family
def fit_model(r: pd.Series, kind: str, dist: str):
    r = r.dropna().astype(float)
    kw = dict(mean="Constant", dist=dist, rescale=False)
    if kind == "GARCH":
        am = arch_model(r, vol="GARCH", p=1, q=1, **kw)
    elif kind == "EGARCH":
        am = arch_model(r, vol="EGARCH", p=1, o=1, q=1, **kw)  # o=1 -> signed term gamma*z
    else:
        raise ValueError(kind)
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        res = am.fit(disp="off", update_freq=0, options={"maxiter": 1000})
    msgs = sorted({str(x.message).strip().split("\n")[0] for x in w})
    return res, msgs


def ljung(z: pd.Series, lags=(10, 20)):
    d = acorr_ljungbox(z, lags=list(lags), return_df=True)
    return [{"lags": int(L), "q_stat": float(d.loc[L, "lb_stat"]), "p_value": float(d.loc[L, "lb_pvalue"])} for L in lags]


def residual_diagnostics(res) -> dict:
    z = res.std_resid.dropna()
    lm, lmp, _, _ = het_arch(z, nlags=10)
    jb = stats.jarque_bera(z)
    return {
        "mean": float(z.mean()), "variance": float(z.var(ddof=1)), "skewness": float(stats.skew(z)),
        "excess_kurtosis": float(stats.kurtosis(z)), "jarque_bera_p": float(jb.pvalue),
        "ljung_box_z": ljung(z), "ljung_box_z2": ljung(z ** 2),
        "arch_lm_z": {"lags": 10, "lm_statistic": float(lm), "p_value": float(lmp), "df": 10},
        "clustering_remaining_5pct": bool(lmp < 0.05),
    }


def pack(res, kind: str, dist: str, msgs: list) -> dict:
    ci = res.conf_int()
    params = []
    for k in res.params.index:
        params.append({"name": k, "estimate": float(res.params[k]), "se": float(res.std_err[k]), "t": float(res.tvalues[k]),
                       "p": float(res.pvalues[k]), "ci_low": float(ci.loc[k, "lower"]), "ci_high": float(ci.loc[k, "upper"])})
    cv = res.conditional_volatility
    d = {
        "kind": kind, "dist": dist, "nobs": int(res.nobs), "params": params,
        "loglik": float(res.loglikelihood), "aic": float(res.aic), "bic": float(res.bic),
        "converged": bool(res.convergence_flag == 0), "convergence_flag": int(res.convergence_flag), "warnings": msgs,
        "cov_type": res.cov_type, "cond_vol_mean": float(cv.mean()), "cond_vol_max": float(cv.max()),
        "cond_vol_max_date": cv.idxmax().strftime("%Y-%m-%d"), "cond_vol_min": float(cv.min()),
        "diagnostics": residual_diagnostics(res),
    }
    P = {p["name"]: p for p in params}
    d["near_unit_root"] = bool(abs(d.get("persistence", 0)) >= 0.995) if False else False
    if kind == "GARCH":
        a, b, w = P["alpha[1]"]["estimate"], P["beta[1]"]["estimate"], P["omega"]["estimate"]
        pers = a + b
        d["persistence"] = float(pers)
        d["persistence_state"] = "below 1 (covariance-stationary)" if pers < 1 - 1e-8 else ("equal to 1 (IGARCH: infinite unconditional variance)" if abs(pers - 1) <= 1e-8 else "above 1 (explosive variance)")
        d["unconditional_variance"] = float(w / (1 - pers)) if pers < 1 else None
        d["unconditional_vol"] = float(math.sqrt(w / (1 - pers))) if pers < 1 else None
        d["half_life_days"] = float(math.log(0.5) / math.log(pers)) if 0 < pers < 1 else None
    else:
        b = P["beta[1]"]["estimate"]
        d["persistence"] = float(b)
        d["persistence_state"] = "|beta| < 1 (stationary log variance)" if abs(b) < 1 else "|beta| >= 1 (non-stationary log variance)"
        d["half_life_days"] = float(math.log(0.5) / math.log(b)) if 0 < b < 1 else None
        g = P["gamma[1]"]
        p2 = g["p"]
        p1 = p2 / 2 if g["estimate"] < 0 else 1 - p2 / 2   # one-sided H1: gamma < 0
        d["gamma_test"] = {
            "gamma": g["estimate"], "se": g["se"], "t": g["t"], "p_two_sided": p2, "p_one_sided_negative": float(p1),
            "ci_low": g["ci_low"], "ci_high": g["ci_high"],
            "decision": ("negative_significant" if (g["estimate"] < 0 and p2 < 0.05) else "positive_significant" if (g["estimate"] > 0 and p2 < 0.05) else "insignificant"),
            "reject_h0_one_sided_5pct": bool(p1 < 0.05),
        }
        d["gamma_test"]["interpretation"] = gamma_text(d["gamma_test"], dist)
    d["near_unit_root"] = bool(abs(d["persistence"]) >= 0.995)
    if d["near_unit_root"]:
        d["warnings"] = d["warnings"] + ["Persistence >= 0.995: near unit root; standard errors and parameter comparisons may be unreliable."]
    return d


def gamma_text(g: dict, dist: str) -> str:
    base = f"EGARCH(1,1), {dist} innovations: gamma = {g['gamma']:.4f} (SE {g['se']:.4f}, t = {g['t']:.2f}, two-sided p = {g['p_two_sided']:.4g}; one-sided p for H1 gamma<0 = {g['p_one_sided_negative']:.4g}). "
    if g["decision"] == "negative_significant":
        return base + "Gamma is negative and statistically significant at 5%: negative standardised shocks raise next-period log variance more than positive shocks of equal size. This supports H1 within this model and sample."
    if g["decision"] == "positive_significant":
        return base + "Gamma is positive and statistically significant: positive shocks have the LARGER effect, which contradicts H1 (the opposite of the usual leverage pattern)."
    return base + "Gamma is not statistically significant: there is insufficient evidence of asymmetry, so H0 is not rejected."


# --------------------------------------------------------------------------- shock experiment (closed-form from ESTIMATED parameters)
def _pm(model: dict) -> dict:
    return {p["name"]: p["estimate"] for p in model["params"]}


def simulate_shock(garch: dict, egarch: dict, k: float, horizon: int = 40, kmax: float = 5.0) -> dict:
    """
    Model-implied volatility response to a standardised shock of +/-k at t=0.
    Reference state: the model's steady state (GARCH: unconditional variance; EGARCH: log-variance fixed point w/(1-beta)).
    After the shock, future innovations are held at the reference assumption (GARCH: E[eps^2]=sigma^2; EGARCH: news term = 0).
    This is a MODEL-IMPLIED EXPERIMENT, not a market forecast.
    """
    g, e = _pm(garch), _pm(egarch)
    a, b, w = g["alpha[1]"], g["beta[1]"], g["omega"]
    if a + b >= 1:
        raise ValueError("GARCH alpha+beta >= 1: unconditional variance undefined; simulation not available.")
    s2 = w / (1 - a - b)
    we, ae, ge, be = e["omega"], e["alpha[1]"], e["gamma[1]"], e["beta[1]"]
    if abs(be) >= 1:
        raise ValueError("EGARCH |beta| >= 1: no steady state; simulation not available.")
    Lstar = we / (1 - be)
    c = C_NORMAL

    def garch_path(kk):
        v, out = s2 * (1 + a * (kk ** 2 - 1)), []
        for _ in range(horizon):
            out.append(v)
            v = w + (a + b) * v
        return np.array(out)

    def egarch_path(kk, sign):
        L, out = we + be * Lstar + ae * (abs(kk) - c) + ge * sign * abs(kk), []
        for _ in range(horizon):
            out.append(math.exp(L))
            L = we + be * L
        return np.array(out)

    def pack_path(v, base):
        return {"variance": v.tolist(), "vol": np.sqrt(v).tolist(), "pct_change_variance": ((v / base - 1) * 100).tolist()}

    gp, gn = garch_path(k), garch_path(k)           # identical by construction (eps^2)
    ep, en = egarch_path(k, +1), egarch_path(k, -1)
    ebase = math.exp(Lstar)
    ks = np.linspace(0, kmax, 21)
    return {
        "disclaimer": "Model-implied experiment from estimated parameters. Not a market forecast.",
        "k": k, "horizon": horizon, "reference": {"garch_baseline_variance": s2, "garch_baseline_vol": math.sqrt(s2),
                                                  "egarch_baseline_variance": ebase, "egarch_baseline_vol": math.sqrt(ebase)},
        "params": {"garch": {"omega": w, "alpha": a, "beta": b}, "egarch": {"omega": we, "alpha": ae, "gamma": ge, "beta": be, "E_abs_z": c}},
        "initial_shock": {"standardised": k, "return_pct": k * math.sqrt(s2)},
        "garch": {"positive": pack_path(gp, s2), "negative": pack_path(gn, s2)},
        "egarch": {"positive": pack_path(ep, ebase), "negative": pack_path(en, ebase)},
        "impact_day1": {
            "garch_pos_vol": math.sqrt(gp[0]), "garch_neg_vol": math.sqrt(gn[0]),
            "egarch_pos_vol": math.sqrt(ep[0]), "egarch_neg_vol": math.sqrt(en[0]),
            "egarch_pos_pct_var": float((ep[0] / ebase - 1) * 100), "egarch_neg_pct_var": float((en[0] / ebase - 1) * 100),
            "garch_pct_var": float((gp[0] / s2 - 1) * 100),
            "egarch_neg_minus_pos_pct_var": float((en[0] - ep[0]) / ebase * 100),
            "egarch_var_ratio_neg_over_pos": float(en[0] / ep[0]),
        },
        "surface": {
            "ks": ks.tolist(),
            "egarch_positive": [np.sqrt(egarch_path(x, +1)).tolist() for x in ks],
            "egarch_negative": [np.sqrt(egarch_path(x, -1)).tolist() for x in ks],
            "garch": [np.sqrt(garch_path(x)).tolist() for x in ks],
        },
    }


def news_impact(garch: dict, egarch: dict) -> list:
    g, e = _pm(garch), _pm(egarch)
    s2 = g["omega"] / (1 - g["alpha[1]"] - g["beta[1]"])
    Ls = e["omega"] / (1 - e["beta[1]"])
    rows = []
    for z in np.linspace(-4, 4, 81):
        gv = g["omega"] + g["alpha[1]"] * (z ** 2) * s2 + g["beta[1]"] * s2
        ev = math.exp(e["omega"] + e["beta[1]"] * Ls + e["alpha[1]"] * (abs(z) - C_NORMAL) + e["gamma[1]"] * z)
        rows.append({"z": float(z), "garch_var": float(gv), "egarch_var": float(ev)})
    return rows


# --------------------------------------------------------------------------- robustness
def period_models(ret: pd.Series) -> dict:
    out = {}
    for key, (label, a, b) in PERIODS.items():
        r = ret.loc[a:b].dropna()
        entry = {"label": label, "start": a, "end": b, "nobs": int(r.size), "std": float(r.std(ddof=1)), "models": {}}
        for dist in ("normal", "t"):
            for kind in ("GARCH", "EGARCH"):
                try:
                    res, msgs = fit_model(r, kind, dist)
                    entry["models"][f"{kind}_{dist}"] = pack(res, kind, dist, msgs)
                    entry["models"][f"{kind}_{dist}"]["_cv"] = res.conditional_volatility if key == "full" else None
                except Exception as ex:  # report failure, never fabricate
                    entry["models"][f"{kind}_{dist}"] = {"kind": kind, "dist": dist, "error": str(ex), "converged": False}
        out[key] = entry
    return out


def gamma_difference_tests(models: dict) -> list:
    """Wald z-test for equality of EGARCH gamma between INDEPENDENT sub-samples (approximation; subsamples are disjoint)."""
    rows = []
    for dist in ("normal", "t"):
        for a, b in (("pre", "covid"), ("pre", "post"), ("covid", "post")):
            ma, mb = models[a]["models"].get(f"EGARCH_{dist}", {}), models[b]["models"].get(f"EGARCH_{dist}", {})
            if "gamma_test" not in ma or "gamma_test" not in mb:
                continue
            ga, gb = ma["gamma_test"], mb["gamma_test"]
            z = (ga["gamma"] - gb["gamma"]) / math.sqrt(ga["se"] ** 2 + gb["se"] ** 2)
            p = 2 * (1 - stats.norm.cdf(abs(z)))
            rows.append({"dist": dist, "a": models[a]["label"], "b": models[b]["label"], "gamma_a": ga["gamma"], "gamma_b": gb["gamma"],
                         "diff": ga["gamma"] - gb["gamma"], "z": float(z), "p_value": float(p), "significant_5pct": bool(p < 0.05),
                         "caution": "A near-unit-root fit in one sub-sample makes this z-test unreliable." if (ma.get("near_unit_root") or mb.get("near_unit_root")) else ""})
    return rows


# --------------------------------------------------------------------------- out-of-sample forecasting
def newey_west_var(d: np.ndarray, lags: int) -> float:
    d = d - d.mean()
    T = d.size
    v = float(d @ d) / T
    for l in range(1, lags + 1):
        v += 2 * (1 - l / (lags + 1)) * float(d[l:] @ d[:-l]) / T
    return v


def forecast_study(ret: pd.Series, hl: pd.Series) -> dict:
    """
    Chronological split, NO LEAKAGE: parameters used for forecasts in a block are estimated only on data BEFORE the block.
    The conditional variance for day t uses information up to t-1 only (one-step-ahead).
    """
    r = ret.dropna()
    split = pd.Timestamp(OOS_SPLIT)
    test_idx = r.index[r.index >= split]
    rows = []
    for i in range(0, len(test_idx), REFIT_EVERY):
        blk = test_idx[i:i + REFIT_EVERY]
        train = r[r.index < blk[0]]
        upto = r[r.index <= blk[-1]]
        mu_tr = float(train.mean())
        rec = {"idx": blk}
        for kind in ("GARCH", "EGARCH"):
            res, _ = fit_model(train, kind, "normal")
            am = arch_model(upto, mean="Constant", dist="normal", rescale=False, **({"vol": "GARCH", "p": 1, "q": 1} if kind == "GARCH" else {"vol": "EGARCH", "p": 1, "o": 1, "q": 1}))
            fixed = am.fix(res.params.values)
            rec[kind] = (fixed.conditional_volatility.loc[blk] ** 2).values
        rec["HIST"] = np.full(len(blk), float(((train - mu_tr) ** 2).mean()))
        rec["mu"] = np.full(len(blk), mu_tr)
        rows.append(rec)
    df = pd.DataFrame({
        "date": np.concatenate([x["idx"] for x in rows]), "garch_var": np.concatenate([x["GARCH"] for x in rows]),
        "egarch_var": np.concatenate([x["EGARCH"] for x in rows]), "hist_var": np.concatenate([x["HIST"] for x in rows]),
        "mu": np.concatenate([x["mu"] for x in rows])}).set_index("date")
    df["return"] = r.loc[df.index]
    df["proxy_sq"] = (df["return"] - df["mu"]) ** 2
    df["proxy_pk"] = (np.log(hl.loc[df.index, "High"] / hl.loc[df.index, "Low"]) ** 2) / (4 * math.log(2)) * 1e4
    out = {"split_date": OOS_SPLIT, "train_end": str(r.index[r.index < split][-1].date()), "n_train": int((r.index < split).sum()),
           "n_test": int(len(df)), "refit_every_days": REFIT_EVERY, "scheme": "expanding window, one-step-ahead conditional variance, normal innovations",
           "proxies": {}}
    for pname, plabel in (("proxy_sq", "Squared demeaned return"), ("proxy_pk", "Parkinson high-low range variance")):
        tab, loss_q = {}, {}
        for m in ("garch_var", "egarch_var", "hist_var"):
            h, y = df[m].values, df[pname].values
            q = np.log(h) + y / h
            loss_q[m] = q
            tab[m] = {"MSE": float(np.mean((y - h) ** 2)), "QLIKE": float(q.mean()), "MAE_var": float(np.mean(np.abs(y - h)))}
        d = loss_q["garch_var"] - loss_q["egarch_var"]
        T = d.size
        dm = d.mean() / math.sqrt(newey_west_var(d, 5) / T)
        out["proxies"][pname] = {"label": plabel, "losses": tab,
                                 "dm_garch_minus_egarch_qlike": {"mean_diff": float(d.mean()), "dm_stat": float(dm), "p_value": float(2 * (1 - stats.norm.cdf(abs(dm)))),
                                                                  "note": "Positive diff => EGARCH has lower QLIKE. Newey-West (5 lags) variance."}}
    out["note"] = ("QLIKE is robust to noise in the volatility proxy (Patton, 2011) and is computed with both the squared-return proxy and a high-low range proxy. "
                   "Forecast accuracy is a different question from whether gamma is significant.")
    return out, df


# --------------------------------------------------------------------------- advanced analysis
def rolling_gamma(ret: pd.Series, window=504, step=21) -> list:
    """Rolling-window EGARCH(1,1) (normal) re-estimation: time variation of gamma with 95% CI. Window = 504 days (~2y)."""
    r = ret.dropna()
    out = []
    for end in range(window, len(r) + 1, step):
        w = r.iloc[end - window:end]
        try:
            res, _ = fit_model(w, "EGARCH", "normal")
            ci = res.conf_int()
            out.append({"date": str(w.index[-1].date()), "gamma": float(res.params["gamma[1]"]), "se": float(res.std_err["gamma[1]"]),
                        "lo": float(ci.loc["gamma[1]", "lower"]), "hi": float(ci.loc["gamma[1]", "upper"]), "p": float(res.pvalues["gamma[1]"]),
                        "beta": float(res.params["beta[1]"]), "converged": bool(res.convergence_flag == 0)})
        except Exception:
            out.append({"date": str(w.index[-1].date()), "gamma": None, "converged": False})
    return out


def nic_surface(garch: dict, egarch: dict) -> dict:
    """Next-day variance as a function of the standardised shock z and the prior volatility state m = sigma(t-1)/sigma_bar."""
    g, e = _pm(garch), _pm(egarch)
    s2 = g["omega"] / (1 - g["alpha[1]"] - g["beta[1]"])
    Ls = e["omega"] / (1 - e["beta[1]"])
    zs, ms = np.linspace(-4, 4, 33), np.linspace(0.5, 3.0, 26)
    gv, ev = [], []
    for m in ms:
        prev = (m ** 2) * s2
        gv.append([float(g["omega"] + g["alpha[1]"] * z * z * prev + g["beta[1]"] * prev) for z in zs])
        ev.append([float(math.exp(e["omega"] + e["beta[1]"] * math.log((m ** 2) * math.exp(Ls)) + e["alpha[1]"] * (abs(z) - C_NORMAL) + e["gamma[1]"] * z)) for z in zs])
    return {"z": zs.tolist(), "m": ms.tolist(), "garch": gv, "egarch": ev, "note": "Model-implied surface from estimated full-sample parameters (normal). Prior state m scales sigma(t-1) relative to the model steady state."}


# --------------------------------------------------------------------------- full pipeline
def run_all(raw: pd.DataFrame, progress=lambda m: None) -> dict:
    progress("Cleaning data and computing log returns")
    clean, quality = clean_data(raw)
    s = clean[clean["InPrimarySample"]].set_index("Date")
    ret = s["Return"]
    r = ret.dropna()

    progress("Descriptive statistics, ADF and ARCH-LM")
    desc = describe(r)
    adf = adf_test(r)
    lm = arch_lm(r - r.mean())

    progress("Estimating GARCH / EGARCH for all periods and distributions (this takes a moment)")
    models = period_models(ret)
    full = models["full"]["models"]
    cvs = {k: v.pop("_cv", None) for k, v in full.items()}
    for per in models.values():
        for m in per["models"].values():
            m.pop("_cv", None)
    g_n, e_n = full["GARCH_normal"], full["EGARCH_normal"]
    if "error" in g_n or "error" in e_n:
        raise RuntimeError("Primary GARCH/EGARCH estimation failed: " + str(g_n.get("error") or e_n.get("error")))

    progress("Out-of-sample forecast evaluation")
    fc, fc_df = forecast_study(ret, s[["High", "Low"]])

    progress("Rolling-window EGARCH gamma")
    rg = rolling_gamma(ret)
    progress("Assembling results")
    nic = news_impact(g_n, e_n)
    default_sim = simulate_shock(g_n, e_n, 2.0)
    comparison = []
    for key in ("GARCH_normal", "EGARCH_normal", "GARCH_t", "EGARCH_t"):
        m = full[key]
        if "error" in m:
            continue
        d = m["diagnostics"]
        comparison.append({"model": key, "loglik": m["loglik"], "aic": m["aic"], "bic": m["bic"], "k_params": len(m["params"]), "converged": m["converged"],
                           "lb_z_10_p": d["ljung_box_z"][0]["p_value"], "lb_z2_10_p": d["ljung_box_z2"][0]["p_value"], "arch_lm_z_p": d["arch_lm_z"]["p_value"]})
    # likelihood-ratio test: GARCH(1,1) is NOT nested in EGARCH in general, so we do not run an LR test; we say so.
    findings = build_findings(desc, adf, lm, models, comparison, fc)

    series = pd.DataFrame({
        "date": s.index.strftime("%Y-%m-%d"), "close": s["Close"].values, "open": s["Open"].values, "high": s["High"].values, "low": s["Low"].values,
        "ret": s["Return"].values, "volume": s["Volume"].values}, index=s.index)
    series["rv30"] = series["ret"].rolling(30, min_periods=30).std()
    series["garch_vol"] = cvs["GARCH_normal"]
    series["egarch_vol"] = cvs["EGARCH_normal"]

    # volatility term-structure terrain: rolling std for windows 5..120 at 128 evenly spaced dates (real data)
    wins = list(range(5, 125, 5))
    ix = np.linspace(0, len(series) - 1, 128).astype(int)
    terrain = {"windows": wins, "dates": series["date"].values[ix].tolist(),
               "values": [series["ret"].rolling(w, min_periods=2).std().bfill().values[ix].round(4).tolist() for w in wins]}

    results = {
        "meta": {"generated_at": datetime.now(timezone.utc).isoformat(), "python_libs": _versions(),
                 "sample": {"start": SAMPLE_START, "end": SAMPLE_END, "observations_prices": int(len(s)), "observations_returns": int(r.size)},
                 "settings": {"mean_equation": "constant", "garch": "GARCH(1,1) via arch.arch_model(vol='GARCH', p=1, q=1)",
                              "egarch": "EGARCH(1,1) via arch.arch_model(vol='EGARCH', p=1, o=1, q=1); gamma[1] multiplies z(t-1) (signed term)",
                              "distributions": ["normal", "Student's t"], "estimator": "quasi/maximum likelihood (SLSQP), robust (Bollerslev-Wooldridge) standard errors",
                              "returns_unit": "percent log returns", "egarch_E_abs_z": "arch uses sqrt(2/pi) (normal) as centring constant; under Student-t this only shifts omega, not gamma",
                              "reproducibility": "deterministic optimiser, no random numbers used in estimation"}},
        "quality": quality, "descriptive": desc, "descriptive_by_period": {k: describe(ret.loc[v[1]:v[2]]) for k, v in PERIODS.items()},
        "adf": adf, "arch_lm": lm, "acf": acf_block(r), "histogram": histogram(r), "models": models, "gamma_diff_tests": gamma_difference_tests(models),
        "news_impact": nic, "comparison": comparison, "forecast": fc, "default_simulation": default_sim, "rolling_gamma": rg, "nic_surface": nic_surface(g_n, e_n), "findings": findings, "terrain": terrain,
    }
    frames = {"clean": clean, "raw": raw, "series": series, "forecast": fc_df, "ret": ret, "full_models_cv": cvs, "sample": s}
    return results, frames


def _versions():
    import arch, statsmodels, scipy, pandas, numpy
    return {"arch": arch.__version__, "statsmodels": statsmodels.__version__, "scipy": scipy.__version__, "pandas": pandas.__version__, "numpy": numpy.__version__}


def build_findings(desc, adf, lm, models, comparison, fc) -> dict:
    full = models["full"]["models"]
    ge, gt = full["EGARCH_normal"].get("gamma_test"), full["EGARCH_t"].get("gamma_test")
    g = full["GARCH_normal"]
    paras = []
    paras.append(f"Sample: {desc['n']} daily log returns ({SAMPLE_START} to {SAMPLE_END}); mean {desc['mean']:.4f}%, std {desc['std']:.4f}%, skewness {desc['skewness']:.3f}, excess kurtosis {desc['excess_kurtosis']:.2f}; Jarque-Bera p = {desc['jarque_bera_p']:.3g}.")
    paras.append(adf["interpretation"])
    paras.append(lm[1]["interpretation"])
    ap = {p["name"]: p for p in g["params"]}
    paras.append(f"GARCH(1,1): alpha = {ap['alpha[1]']['estimate']:.4f}, beta = {ap['beta[1]']['estimate']:.4f}, alpha+beta = {g['persistence']:.4f} ({g['persistence_state']})"
                 + (f"; half-life of a variance shock about {g['half_life_days']:.1f} days." if g.get("half_life_days") else "."))
    if ge:
        paras.append(ge["interpretation"])
    if gt:
        paras.append(gt["interpretation"])
    decision = "INCONCLUSIVE"
    if ge:
        if ge["decision"] == "negative_significant" and ge["reject_h0_one_sided_5pct"]:
            decision = "H0 REJECTED in favour of H1 (negative shocks have the larger effect) in the full-sample EGARCH(1,1)"
            if gt and gt["decision"] != "negative_significant":
                decision += ", but the Student-t specification does NOT confirm it, so the result is sensitive to the error distribution"
        elif ge["decision"] == "positive_significant":
            decision = "H0 REJECTED but in the OPPOSITE direction to H1 (positive shocks have the larger effect)"
        else:
            decision = "H0 NOT REJECTED: insufficient evidence of asymmetry in the full-sample EGARCH(1,1)"
    per = []
    for k in ("pre", "covid", "post"):
        m = models[k]["models"].get("EGARCH_normal", {})
        if "gamma_test" in m:
            per.append(f"{models[k]['label']}: gamma = {m['gamma_test']['gamma']:.4f} (p = {m['gamma_test']['p_two_sided']:.3g})")
    best_aic = min(comparison, key=lambda x: x["aic"])["model"] if comparison else None
    best_bic = min(comparison, key=lambda x: x["bic"])["model"] if comparison else None
    return {
        "hypothesis_decision": decision, "paragraphs": paras, "period_gammas": per, "lowest_aic": best_aic, "lowest_bic": best_bic,
        "caveats": [
            "Statistical significance is not economic significance: compare the size of gamma-implied variance differences with day-to-day volatility.",
            "Lowest AIC/BIC shows relative fit, not that asymmetry is real or the hypothesis is true; the hypothesis is tested through gamma.",
            "Differences in gamma across periods are only called significant when the formal Wald test says so (see robustness page).",
            "The 2020 sub-sample has about 250 observations, so estimates are imprecise and may be sensitive to starting values.",
            "A negative DAILY RETURN is not the same as a negative standardised INNOVATION z(t); EGARCH responds to z(t) = eps(t)/sigma(t).",
            "Shock simulations are model-implied scenarios, not forecasts.",
        ],
    }
