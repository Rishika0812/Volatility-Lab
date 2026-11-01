"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2, Upload } from "lucide-react";
import { Btn, Gate, Interpret, PageHeader, Panel, Stat, Table } from "@/components/ui";
import { f, getJSON, useData } from "@/lib/api";

function Uploader() {
  const { reload } = useData();
  const [msg, setMsg] = useState<string>(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [log, setLog] = useState<string[]>([]);
  const timer = useRef<any>(null);
  const poll = useCallback(() => { timer.current = setInterval(async () => {
    try { const s = await getJSON("/api/status"); setMsg(s.message); setLog(s.log);
      if (s.state === "done") { clearInterval(timer.current); setBusy(false); reload(); } if (s.state === "error") { clearInterval(timer.current); setBusy(false); setErr(s.message); } } catch (e: any) { setErr(e.message); } }, 1500); }, [reload]);
  useEffect(() => () => clearInterval(timer.current), []);
  async function onFile(file: File) {
    setErr(""); setBusy(true); setMsg("Uploading and validating…");
    try { const fd = new FormData(); fd.append("file", file); const up = await getJSON("/api/upload", { method: "POST", body: fd });
      setMsg(`Validated ${up.quality.rows_uploaded} rows (${up.quality.primary_sample.price_observations} in the 2015–2025 sample). Running models…`);
      await getJSON("/api/analyze", { method: "POST" }); poll(); } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (<Panel title="Upload a Nifty 50 CSV and re-run the entire pipeline">
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-volt/50 p-4 text-sm hover:bg-volt/5"><Upload className="h-5 w-5 text-volt" />
      <span>Choose CSV (columns: Date, Price, Open, High, Low, Vol., Change %; dates DD-MM-YYYY)</span><input type="file" accept=".csv" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
    {busy && <div className="mt-3 flex items-center gap-2 text-sm text-silver"><Loader2 className="h-4 w-4 animate-spin" /> {msg} <span className="text-silver/50">(≈1–2 min: 16 model fits + rolling forecasts)</span></div>}
    {err && <div className="mt-3"><Interpret tone="warn">{err}</Interpret></div>}{log.length > 0 && !busy && <pre className="mt-2 max-h-24 overflow-auto text-xs text-silver/50">{log.join("\n")}</pre>}</Panel>);
}

function Explorer() {
  const [which, setWhich] = useState<"cleaned" | "raw" | "excluded">("cleaned");
  const [q, setQ] = useState(""); const [a, setA] = useState(""); const [b, setB] = useState(""); const [page, setPage] = useState(1); const [flag, setFlag] = useState(false);
  const [res, setRes] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { const t = setTimeout(() => { const p = new URLSearchParams({ which, q, page: String(page), limit: "25" }); if (a) p.set("start", a); if (b) p.set("end", b); if (flag) p.set("flagged_only", "true");
    getJSON("/api/data?" + p).then(setRes).catch((e) => setErr(e.message)); }, 250); return () => clearTimeout(t); }, [which, q, a, b, page, flag]);
  const cls = "rounded-md border border-edge bg-navy-900 px-2 py-1 text-xs text-silver";
  return (<Panel title="Data explorer">
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      {(["cleaned", "raw", "excluded"] as const).map((w) => <button key={w} onClick={() => { setWhich(w); setPage(1); }} className={`rounded-md px-3 py-1.5 ${which === w ? "bg-volt/30 text-white" : "bg-white/5 text-silver"}`}>{w === "cleaned" ? "Cleaned (2015–2025)" : w === "raw" ? "Original upload" : "Excluded (2026)"}</button>)}
      <input className={cls + " w-48"} placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      {which !== "raw" && <>From <input type="date" className={cls} value={a} onChange={(e) => { setA(e.target.value); setPage(1); }} /> to <input type="date" className={cls} value={b} onChange={(e) => { setB(e.target.value); setPage(1); }} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={flag} onChange={(e) => { setFlag(e.target.checked); setPage(1); }} /> flagged only</label></>}</div>
    {err && <Interpret tone="warn">{err}</Interpret>}
    {res && <><Table head={res.columns} rows={res.rows.map((r: string[]) => r.map((c, j) => { const n = Number(c); return which !== "raw" && c !== "" && !isNaN(n) && j > 0 && res.columns[j] !== "Flags" ? (Math.abs(n) > 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(Math.round(n * 10000) / 10000)) : c; }))} />
      <div className="mt-3 flex items-center justify-between text-xs text-silver/70"><span>{res.total.toLocaleString()} rows</span><div className="flex gap-2"><button className={cls} disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><span>Page {page} / {Math.max(1, Math.ceil(res.total / res.limit))}</span>
        <button className={cls} disabled={page * res.limit >= res.total} onClick={() => setPage(page + 1)}>Next</button></div></div></>}</Panel>);
}

export default function Page() {
  return (<><PageHeader scene="data" kicker="Page 3 · Data explorer" title="Uploaded data, cleaning and quality checks">The original file is preserved. Suspicious observations are flagged, never silently deleted; 2026 rows are shown separately and excluded from estimation.</PageHeader>
    <Gate>{({ R }) => { const q = R.quality; return (<div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><Stat label="Rows uploaded" value={q.rows_uploaded.toLocaleString()} /><Stat label="Coverage" value={<span className="text-base">{q.date_range_uploaded[0]} → {q.date_range_uploaded[1]}</span>} />
        <Stat label="Primary sample" value={q.primary_sample.price_observations.toLocaleString()} sub="prices 2015–2025" /><Stat label="Excluded 2026" value={q.excluded_after_sample} /><Stat label="Returns" value={q.return_validation.returns_computed.toLocaleString()} sub="first return blank" /></div>
      <div className="flex flex-wrap gap-3"><Btn href="/api/export/excel"><FileSpreadsheet className="h-4 w-4" /> Download Full Excel Workbook</Btn><Btn href="/api/export/csv"><Download className="h-4 w-4" /> Download Cleaned CSV</Btn>
        <Btn href="/api/export/model-results"><FileText className="h-4 w-4" /> Download Model Results</Btn><Btn href="/api/export/report"><FileText className="h-4 w-4" /> Download Statistical Report</Btn></div>
      <Uploader />
      <div className="grid gap-5 lg:grid-cols-2"><Panel title="Data-quality report"><Table head={["Check", "Result"]} rows={[
        ["Source order", q.source_order], ["Unparseable dates", q.unparseable_dates], ["Duplicate dates", q.duplicate_dates.length ? q.duplicate_dates.join(", ") : "none"], ["Non-positive / invalid closes", q.invalid_or_nonpositive_close.length || "none"],
        ...Object.entries(q.missing_by_column).filter(([, v]: any) => v > 0).map(([k, v]: any) => [`Missing in ${k}`, v]), ["Volume values with B suffix", q.volume_rows_with_B_suffix],
        ...Object.entries(q.suspicious_counts).map(([k, v]: any) => [k.replaceAll("_", " "), v])]} /></Panel>
        <Panel title="Return validation (log vs source Change %)"><Table head={["Metric", "Value"]} rows={[["Mean |diff| (pp)", f(q.return_validation.mean_abs_diff_log_vs_source_change_pp, 5)], ["Max |diff| (pp)", f(q.return_validation.max_abs_diff_log_vs_source_change_pp, 4)], ["Correlation", f(q.return_validation.correlation_with_source_change, 5)]]} />
          <div className="mt-3"><Interpret>{q.return_validation.note} {q.note}</Interpret></div><div className="mt-3 text-xs text-silver/60">Observations per year: {Object.entries(q.observations_per_year).map(([y, n]) => `${y}: ${n}`).join(" · ")}</div></Panel></div>
      <Explorer /></div>); }}</Gate></>);
}
