"""Sanity tests on the real dataset: parsing, return formula, sample, model identities."""
import json, math
from pathlib import Path
import numpy as np, pandas as pd
from app import engine, outputs

CSV = outputs.DEFAULT_CSV

def test_parse_volume():
    assert engine.parse_volume("328.56M") == 328.56e6 and engine.parse_volume("1.2B") == 1.2e9 and math.isnan(engine.parse_volume(None))

def test_clean_and_returns():
    raw = engine.read_raw(CSV); clean, q = engine.clean_data(raw)
    assert clean["Date"].is_monotonic_increasing and q["duplicate_dates"] == []
    s = clean[clean.InPrimarySample]
    assert s.Date.min() >= pd.Timestamp("2015-01-01") and s.Date.max() <= pd.Timestamp("2025-12-31")
    assert math.isnan(s.Return.iloc[0])
    i = 10
    assert abs(s.Return.iloc[i] - 100 * math.log(s.Close.iloc[i] / s.Close.iloc[i - 1])) < 1e-12
    assert q["excluded_after_sample"] > 0   # 2026 rows preserved but excluded

def test_models_converge_and_identities():
    raw = engine.read_raw(CSV); clean, _ = engine.clean_data(raw)
    r = clean[clean.InPrimarySample].set_index("Date")["Return"].dropna()
    res, _ = engine.fit_model(r, "EGARCH", "normal"); m = engine.pack(res, "EGARCH", "normal", [])
    assert m["converged"] and "gamma_test" in m
    g, _ = engine.fit_model(r, "GARCH", "normal"); gm = engine.pack(g, "GARCH", "normal", [])
    sim = engine.simulate_shock(gm, m, 2.0)
    assert sim["garch"]["positive"]["variance"] == sim["garch"]["negative"]["variance"]      # GARCH symmetric
    gam = m["gamma_test"]["gamma"]
    ep, en = sim["egarch"]["positive"]["variance"][0], sim["egarch"]["negative"]["variance"][0]
    assert (en > ep) == (gam < 0)                                                              # sign follows estimated gamma
