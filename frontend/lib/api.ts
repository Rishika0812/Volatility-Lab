"use client";
import { createContext, useContext, useEffect, useState, ReactNode, createElement } from "react";

// Types are intentionally loose (any): the shape is defined by backend/app/engine.py and returned verbatim.
export type Results = any;
export type SeriesRow = { date: string; close: number; open: number; high: number; low: number; ret: number | null; volume: number | null; rv30: number | null; garch_vol: number | null; egarch_vol: number | null };

export async function getJSON<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = j.detail || JSON.stringify(j); } catch {}
    throw new Error(`${r.status}: ${msg}`);
  }
  return r.json();
}

type Ctx = { R: Results | null; series: SeriesRow[]; loading: boolean; error: string | null; reload: () => void };
export const C = createContext<Ctx>({ R: null, series: [], loading: true, error: null, reload: () => {} });
export const useData = () => useContext(C);

export function DataProvider({ children }: { children: ReactNode }) {
  const [R, setR] = useState<Results | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let off = false;
    setLoading(true);
    Promise.all([getJSON("/api/results"), getJSON("/api/series")])
      .then(([r, s]) => {
        if (off) return;
        const cols: string[] = s.columns;
        setSeries(s.rows.map((row: any[]) => Object.fromEntries(cols.map((c, i) => [c, row[i]])) as SeriesRow));
        setR(r); setError(null);
      })
      .catch((e) => !off && setError(String(e.message || e)))
      .finally(() => !off && setLoading(false));
    return () => { off = true; };
  }, [n]);
  return createElement(C.Provider, { value: { R, series, loading, error, reload: () => setN((x) => x + 1) } }, children);
}

export const f = (x: number | null | undefined, d = 4) => (x === null || x === undefined || Number.isNaN(x) ? "—" : x.toFixed(d));
export const pv = (p: number | null | undefined) => (p === null || p === undefined ? "—" : p < 0.0001 ? "<0.0001" : p.toFixed(4));
