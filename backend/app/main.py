"""FastAPI econometric service. Every endpoint serves REAL pipeline outputs or runs the real models."""
from __future__ import annotations
import json, threading, time, traceback
from typing import Optional

import pandas as pd
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import engine, outputs, pipeline

app = FastAPI(title="Volatility Lab API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
OUT = outputs.OUT_DIR
STATUS = {"state": "idle", "message": "", "log": [], "started": None, "finished": None}
LOCK = threading.Lock()
_cache: dict = {}


def _load(name: str):
    p = OUT / name
    if not p.exists():
        raise HTTPException(404, "No results yet. Upload a CSV (POST /api/upload) and run POST /api/analyze, or run `python run_pipeline.py`.")
    key, m = name, p.stat().st_mtime
    if _cache.get(key, (None, None))[0] != m:
        _cache[key] = (m, json.loads(p.read_text()))
    return _cache[key][1]


def _csv(name):
    p = OUT / name
    if not p.exists():
        raise HTTPException(404, "No results yet.")
    key, m = name, p.stat().st_mtime
    if _cache.get(key, (None, None))[0] != m:
        _cache[key] = (m, pd.read_csv(p, dtype=str, keep_default_na=False))
    return _cache[key][1]


@app.get("/api/health")
def health():
    return {"ok": True, "has_results": (OUT / "results.json").exists(), "libs": engine._versions()}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    try:
        raw = engine.read_raw(content)
        clean, q = engine.clean_data(raw)
    except Exception as e:
        raise HTTPException(422, f"CSV validation failed: {e}")
    if q["primary_sample"]["price_observations"] < 500:
        raise HTTPException(422, f"Only {q['primary_sample']['price_observations']} observations fall in 2015-01-01..2025-12-31; need at least 500.")
    outputs.DATA_DIR.mkdir(exist_ok=True)
    outputs.UPLOAD_PATH.write_bytes(content)
    return {"filename": file.filename, "bytes": len(content), "quality": q, "next": "POST /api/analyze"}


def _job():
    try:
        src = outputs.UPLOAD_PATH if outputs.UPLOAD_PATH.exists() else outputs.DEFAULT_CSV
        STATUS["log"].append(f"Using {src.name}")
        pipeline.run(src, progress=lambda m: (STATUS.update(message=m), STATUS["log"].append(m)))
        STATUS.update(state="done", finished=time.time(), message="Analysis complete")
    except Exception as e:
        STATUS.update(state="error", finished=time.time(), message=f"{type(e).__name__}: {e}")
        STATUS["log"].append(traceback.format_exc()[-1500:])


@app.post("/api/analyze")
def analyze():
    with LOCK:
        if STATUS["state"] == "running":
            raise HTTPException(409, "Analysis already running")
        STATUS.update(state="running", message="Starting", log=[], started=time.time(), finished=None)
    threading.Thread(target=_job, daemon=True).start()
    return {"state": "running"}


@app.get("/api/status")
def status():
    return STATUS


@app.get("/api/results")
def results():
    return _load("results.json")


@app.get("/api/series")
def series():
    return _load("series.json")


@app.get("/api/diagnostics")
def diagnostics():
    R = _load("results.json")
    return {"adf": R["adf"], "arch_lm": R["arch_lm"], "acf": R["acf"], "comparison": R["comparison"],
            "residual_diagnostics": {f"{k}": v["models"][m]["diagnostics"] for k, v in R["models"].items() if k == "full" for m in v["models"] if "diagnostics" in v["models"][m]}}


@app.get("/api/robustness")
def robustness():
    R = _load("results.json")
    return {"periods": R["models"], "gamma_diff_tests": R["gamma_diff_tests"]}


class ShockReq(BaseModel):
    k: float = 2.0
    horizon: int = 40
    dist: str = "normal"


@app.post("/api/simulate-shock")
def simulate(req: ShockReq):
    if not (0 < req.k <= 8) or not (5 <= req.horizon <= 250) or req.dist not in ("normal", "t"):
        raise HTTPException(422, "k in (0,8], horizon in [5,250], dist in {normal,t}")
    R = _load("results.json")["models"]["full"]["models"]
    g, e = R[f"GARCH_{req.dist}"], R[f"EGARCH_{req.dist}"]
    if "error" in g or "error" in e:
        raise HTTPException(422, "Required model did not estimate")
    try:
        out = engine.simulate_shock(g, e, req.k, req.horizon)
    except ValueError as ex:
        raise HTTPException(422, str(ex))
    out["dist"] = req.dist
    out["converged"] = {"garch": g["converged"], "egarch": e["converged"]}
    return out


@app.get("/api/data")
def data(which: str = "cleaned", q: str = "", start: Optional[str] = None, end: Optional[str] = None, page: int = 1, limit: int = 50, flagged_only: bool = False):
    if which not in ("raw", "cleaned", "excluded"):
        raise HTTPException(422, "which must be raw|cleaned|excluded")
    df = _csv("raw_data.csv" if which == "raw" else "cleaned_data.csv")
    if which == "excluded":
        df = df[df["InPrimarySample"] == "False"]
    elif which == "cleaned":
        df = df[df["InPrimarySample"] == "True"]
    if which != "raw":
        if start: df = df[df["Date"] >= start]
        if end: df = df[df["Date"] <= end]
        if flagged_only: df = df[df["Flags"] != ""]
    if q:
        df = df[df.apply(lambda r: q.lower() in " ".join(r.astype(str)).lower(), axis=1)]
    total = len(df)
    limit = max(1, min(limit, 500))
    sl = df.iloc[(page - 1) * limit: page * limit]
    return {"total": total, "page": page, "limit": limit, "columns": list(df.columns), "rows": sl.values.tolist()}


def _file(name, media, dl):
    p = OUT / name
    if not p.exists():
        raise HTTPException(404, "File not generated yet. Run the analysis first.")
    return FileResponse(p, media_type=media, filename=dl)


@app.get("/api/export/excel")
def x_excel():
    return _file(outputs.XLSX_NAME, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", outputs.XLSX_NAME)


@app.get("/api/export/csv")
def x_csv():
    return _file("cleaned_primary_sample.csv", "text/csv", "Nifty50_cleaned_2015_2025.csv")


@app.get("/api/export/model-results")
def x_models():
    return _file("results.json", "application/json", "model_results.json")


@app.get("/api/export/report")
def x_report():
    return _file("statistical_report.md", "text/markdown", "statistical_report.md")
