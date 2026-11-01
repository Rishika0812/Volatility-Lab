# VOLATILITY LAB – Understanding Asymmetric Volatility in the Indian Equity Market

Interactive 3D econometric research platform for the Nifty 50 (1 Jan 2015 – 31 Dec 2025).
Tests whether negative shocks raise subsequent conditional volatility more than positive shocks of equal size
(H0: EGARCH γ = 0 vs H1: γ < 0).

```
volatility-lab/
├── data/        Nifty_50_Historical_Data.csv  (your upload; uploaded.csv is created by the UI)
├── output/      Pipeline outputs: results.json, series.json, cleaned CSVs, Excel workbook, report  (pre-generated from your data)
├── backend/     Python: FastAPI + pandas / statsmodels / arch / scipy / xlsxwriter
│   ├── app/engine.py     cleaning, returns, ADF, ARCH-LM, GARCH, EGARCH, Student-t, sub-periods, forecasts, shock maths
│   ├── app/outputs.py    persistence + 16-sheet Excel + statistical report
│   ├── app/main.py       REST API
│   ├── run_pipeline.py   CLI: CSV → everything in output/
│   └── tests/            pytest sanity tests on the real dataset
└── frontend/    Next.js 14 (App Router, dark neon UI, persistent 3D backdrop, sidebar shell) · TypeScript · Tailwind · React Three Fiber · Drei · Recharts · Framer Motion · Lucide
```

## 1. Requirements
Python ≥ 3.10, Node ≥ 18.

## 2. Backend (econometric service)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run_pipeline.py            # optional: regenerates ../output from ../data/Nifty_50_Historical_Data.csv (~30–60 s)
uvicorn app.main:app --port 8000
pytest -q tests                   # optional
```

## 3. Frontend
```bash
cd frontend
cp .env.example .env.local        # BACKEND_URL=http://127.0.0.1:8000
npm install
npm run dev                       # http://localhost:3000
```
The browser only calls `/api/*` on the Next.js server, which proxies to FastAPI (`next.config.mjs` rewrites).
Production: `npm run build && npm start`.

## 4. Using it
* Open `http://localhost:3000` – results from the pre-generated run load immediately.
* **Data Explorer → upload** any Nifty CSV with the same schema (Date DD-MM-YYYY, Price, Open, High, Low, Vol., Change %) – this triggers `POST /api/upload` → `POST /api/analyze` (real re-estimation, polled via `/api/status`).
* **Analysis Studio** (`/studio`): 3D news-impact surface (EGARCH vs GARCH, from estimated parameters), 3D monthly realised-volatility calendar, 3D return cloud, and rolling-window EGARCH γ with confidence bands (re-estimated in Python).
* Downloads: Full Excel workbook (16 sheets, live formulas in `Daily_Returns` and `Descriptive_Statistics`), cleaned CSV, model results (JSON), statistical report (Markdown).

## 5. API
| Method | Path | Purpose |
|---|---|---|
| POST | /api/upload | validate + store CSV |
| POST | /api/analyze | run full pipeline in background |
| GET | /api/status | pipeline progress |
| GET | /api/results, /api/series | all results / chart series |
| GET | /api/diagnostics, /api/robustness | tests, ACF/PACF, residual diagnostics; sub-period models + γ-difference tests |
| POST | /api/simulate-shock `{k, horizon, dist}` | model-implied ±k sd shock response from the ESTIMATED parameters |
| GET | /api/data?which=cleaned\|raw\|excluded&q=&start=&end=&page= | searchable data explorer |
| GET | /api/export/excel \| csv \| model-results \| report | downloads |

## 6. Methodology notes (what exactly is estimated)
* Returns: `r = 100·ln(Pt/Pt-1)` from closing prices inside 2015-01-01…2025-12-31 (2,726 prices → 2,725 returns; first return blank). 2026 rows (205) are preserved and excluded. Source `Change %` is used only as a validation check.
* Mean equation: constant. GARCH: `arch_model(vol="GARCH", p=1, q=1)`. EGARCH: `arch_model(vol="EGARCH", p=1, o=1, q=1)`; arch's `gamma[1]` multiplies `z(t-1)` (signed), `alpha[1]` multiplies `|z|-E|z|`. Robust (Bollerslev–Wooldridge) SEs. Normal and Student-t errors.
* γ test: two-sided p (as estimated) and one-sided p for H1: γ<0 are both reported; decision rule is automated but never presumes the sign.
* Sub-periods: pre-COVID 2015-19, COVID 2020, post-COVID 2021-25, full. Differences in γ are tested with a Wald z-test for independent samples (approximation; flagged when a fit is near a unit root).
* Forecasting: estimation < 2023-01-01, test 2023-2025, expanding window, re-estimated every 21 days using only earlier data; one-step-ahead variance; QLIKE/MSE with squared-return and Parkinson proxies; Diebold–Mariano on QLIKE.
* Shock simulator: closed-form from estimated parameters, steady-state start; later innovations held at the reference assumption (GARCH E[ε²]=σ²; EGARCH news term 0). Computed in Python (`engine.simulate_shock`), labelled as a model-implied experiment.
* Reproducibility: deterministic optimiser, no random numbers; library versions saved in `results.json → meta.python_libs`.

## 7. Deployment
* **Frontend → Vercel** (or any Node host): set `BACKEND_URL=https://<your-api-host>` as an environment variable.
* **Backend → Render / Railway / Fly / a VM**: `pip install -r backend/requirements.txt`, start with `uvicorn app.main:app --host 0.0.0.0 --port $PORT` from `backend/`. Needs a persistent disk for `output/` and `data/` (or run `python run_pipeline.py` at build time). Restrict CORS in `app/main.py` for production.
* **Docker (single host)**: run the two processes behind a reverse proxy; the Next server only needs to reach the API URL.
* **Google AI Studio** cannot run Python: deploy the FastAPI service separately and point `BACKEND_URL` at it. The frontend never substitutes mock calculations; if the backend is unreachable pages show an explicit error.

## 7b. Phones & touch
* Layout is responsive (collapsible sidebar, wrapping controls, scrollable tables, fluid charts).
* 3D views never trap scrolling: on touch screens one finger scrolls the page until you tap **Rotate 3D** on a scene (tap **Lock** to scroll again). Bloom is lighter on phones; the background scene is disabled on narrow screens; reduced-motion users get a 2D fallback on Home.

## 8. Honest limitations
* UI primitives are hand-written shadcn-style Tailwind components (the shadcn CLI was not used); the 3D scenes were built and type-checked/built/SSR-smoke-tested, but WebGL rendering could not be visually inspected in the build sandbox – please check on your machine and adjust camera/scales if needed.
* One index, daily close-to-close data, constant mean, no GJR/APARCH alternatives.
* Statistical significance ≠ economic significance; lowest AIC/BIC ≠ proof of the hypothesis.
# Volatility-Lab
