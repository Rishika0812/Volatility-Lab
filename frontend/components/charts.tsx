"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo, useState } from "react";

const AX = { stroke: "#6f7fa8", fontSize: 11 };
const TT = { contentStyle: { background: "#0b1330", border: "1px solid #2a3a6a", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#c9d2e6" } };
export type LineDef = { key: string; name?: string; color: string; dash?: string; width?: number };

export function LineC({ data, x, lines, height = 280, yFmt, xTick = 6 }: { data: any[]; x: string; lines: LineDef[]; height?: number; yFmt?: (v: number) => string; xTick?: number }) {
  return (<ResponsiveContainer width="100%" height={height}><LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
    <CartesianGrid stroke="#ffffff10" /><XAxis dataKey={x} {...AX} minTickGap={50} /><YAxis {...AX} tickFormatter={yFmt} width={52} domain={["auto", "auto"]} /><Tooltip {...TT} /><Legend wrapperStyle={{ fontSize: 12 }} />
    {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.name || l.key} stroke={l.color} dot={false} strokeWidth={l.width || 1.4} strokeDasharray={l.dash} isAnimationActive={false} connectNulls />)}
  </LineChart></ResponsiveContainer>);
}
export function AreaC({ data, x, y, color = "#3b6bff", height = 280 }: { data: any[]; x: string; y: string; color?: string; height?: number }) {
  return (<ResponsiveContainer width="100%" height={height}><AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
    <defs><linearGradient id={"g" + y} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.5} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid stroke="#ffffff10" /><XAxis dataKey={x} {...AX} minTickGap={50} /><YAxis {...AX} width={56} domain={["auto", "auto"]} /><Tooltip {...TT} />
    <Area dataKey={y} stroke={color} fill={`url(#g${y})`} dot={false} isAnimationActive={false} strokeWidth={1.4} /></AreaChart></ResponsiveContainer>);
}
/** Returns bar chart coloured green/red by sign. */
export function SignBars({ data, x, y, height = 260 }: { data: any[]; x: string; y: string; height?: number }) {
  return (<ResponsiveContainer width="100%" height={height}><BarChart data={data} margin={{ left: 0, right: 12, top: 8 }}><CartesianGrid stroke="#ffffff10" />
    <XAxis dataKey={x} {...AX} minTickGap={50} /><YAxis {...AX} width={44} /><Tooltip {...TT} /><ReferenceLine y={0} stroke="#6f7fa8" />
    <Bar dataKey={y} isAnimationActive={false}>{data.map((d, i) => <Cell key={i} fill={d[y] >= 0 ? "#2fd18b" : "#d1566b"} />)}</Bar></BarChart></ResponsiveContainer>);
}
export function HistC({ bins }: { bins: { x: number; density: number; normal: number }[] }) {
  return (<ResponsiveContainer width="100%" height={300}><ComposedChart data={bins} margin={{ left: 0, right: 12, top: 8 }}><CartesianGrid stroke="#ffffff10" />
    <XAxis dataKey="x" {...AX} tickFormatter={(v) => v.toFixed(1)} /><YAxis {...AX} width={44} /><Tooltip {...TT} formatter={(v: number) => v.toFixed(4)} labelFormatter={(v) => `return ≈ ${Number(v).toFixed(2)}%`} /><Legend wrapperStyle={{ fontSize: 12 }} />
    <Bar dataKey="density" name="Empirical density" fill="#3b6bff" isAnimationActive={false} /><Line dataKey="normal" name="Normal (same mean/sd)" stroke="#ff9f43" dot={false} strokeWidth={2} isAnimationActive={false} /></ComposedChart></ResponsiveContainer>);
}
export function CorrBars({ values, ci, color = "#3b6bff", height = 220 }: { values: number[]; ci: number; color?: string; height?: number }) {
  const d = values.map((v, i) => ({ lag: i + 1, v }));
  return (<ResponsiveContainer width="100%" height={height}><BarChart data={d} margin={{ left: 0, right: 12, top: 8 }}><CartesianGrid stroke="#ffffff10" />
    <XAxis dataKey="lag" {...AX} /><YAxis {...AX} width={40} domain={[-0.2, "auto"]} /><Tooltip {...TT} formatter={(v: number) => v.toFixed(3)} />
    <ReferenceLine y={ci} stroke="#ff9f43" strokeDasharray="4 3" /><ReferenceLine y={-ci} stroke="#ff9f43" strokeDasharray="4 3" /><ReferenceLine y={0} stroke="#6f7fa8" />
    <Bar dataKey="v" fill={color} isAnimationActive={false} /></BarChart></ResponsiveContainer>);
}
/** Date-range filter state helper for series charts. */
export function useRange<T extends { date: string }>(rows: T[]) {
  const [a, setA] = useState(rows[0]?.date ?? "2015-01-01");
  const [b, setB] = useState(rows[rows.length - 1]?.date ?? "2025-12-31");
  const out = useMemo(() => rows.filter((r) => r.date >= a && r.date <= b), [rows, a, b]);
  return { out, a, b, setA, setB };
}
export function DateRange({ a, b, setA, setB, min, max }: { a: string; b: string; setA: (s: string) => void; setB: (s: string) => void; min: string; max: string }) {
  const cls = "rounded-md border border-edge bg-navy-900 px-2 py-1 font-mono text-xs text-silver";
  return (<div className="flex flex-wrap items-center gap-2 text-xs text-silver/70">From <input type="date" className={cls} value={a} min={min} max={max} onChange={(e) => setA(e.target.value)} />
    to <input type="date" className={cls} value={b} min={min} max={max} onChange={(e) => setB(e.target.value)} /></div>);
}
