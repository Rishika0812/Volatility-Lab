"use client";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { MouseEvent, ReactNode, useRef } from "react";
import { AlertTriangle, Loader2, Info } from "lucide-react";
import { useData } from "@/lib/api";

const PageHero = dynamic(() => import("./PageScenes"), { ssr: false });
/** Pointer-driven 3D tilt with glare. */
function Tilt({ children, className, deg = 2.5 }: { children: ReactNode; className?: string; deg?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mv = (e: MouseEvent) => { const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateX(${-y * deg}deg) rotateY(${x * deg}deg) translateZ(0)`; el.style.setProperty("--gx", `${(x + 0.5) * 100}%`); el.style.setProperty("--gy", `${(y + 0.5) * 100}%`); };
  return <div ref={ref} onMouseMove={mv} onMouseLeave={() => { if (ref.current) ref.current.style.transform = ""; }} className={clsx(className, "tilt will-change-transform")}>{children}</div>;
}
export const Panel = ({ title, children, className, right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) => (
  <Tilt className={clsx("glass p-5", className)}>
    {(title || right) && <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold uppercase tracking-widest text-silver/80">{title}</h3>{right}</div>}
    {children}
  </Tilt>
);
export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bull" | "bear" | "volt" }) => (
  <Tilt deg={9} className="glass p-4"><div className="text-[11px] uppercase tracking-widest text-silver/60">{label}</div>
    <div className={clsx("mt-1 font-mono text-2xl", tone === "bull" && "text-bull", tone === "bear" && "text-bear", tone === "volt" && "text-volt")}>{value}</div>
    {sub && <div className="mt-1 text-xs text-silver/60">{sub}</div>}</Tilt>
);
export const PageHeader = ({ kicker, title, children, scene }: { kicker: string; title: string; children?: ReactNode; scene?: string }) => (
  <header className="glass relative mb-6 min-h-[210px] sm:min-h-[250px] overflow-hidden !p-0">
    {scene && <div className="absolute inset-0"><PageHero kind={scene} /></div>}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/30 md:via-black/55 md:to-transparent" />
    <div className="relative z-10 max-w-2xl p-5 sm:p-7"><div className="text-xs font-semibold uppercase tracking-[0.3em] text-violet">{kicker}</div>
      <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl md:text-4xl">{title}</h1>{children && <p className="mt-2 text-silver/80">{children}</p>}</div></header>
);
export const Interpret = ({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" | "good" }) => (
  <div className={clsx("flex gap-3 rounded-xl border p-4 text-sm leading-relaxed", tone === "warn" ? "border-amber-500/40 bg-amber-500/5" : tone === "good" ? "border-bull/40 bg-bull/5" : "border-volt/40 bg-volt/5")}>
    {tone === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-volt" />}<div>{children}</div></div>
);
export const Eq = ({ children }: { children: ReactNode }) => <pre className="eq text-sm">{children}</pre>;
export const Badge = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className={clsx("rounded-full px-2 py-0.5 text-xs", ok ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear")}>{children}</span>);
export const Btn = ({ href, children, onClick, disabled }: { href?: string; children: ReactNode; onClick?: () => void; disabled?: boolean }) => {
  const cls = "inline-flex items-center gap-2 rounded-lg border border-volt/50 bg-volt/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-volt/25 disabled:opacity-50";
  return href ? <a className={cls} href={href} download>{children}</a> : <button className={cls} onClick={onClick} disabled={disabled}>{children}</button>;
};

/** Wraps a page: shows loading / backend-error states, or renders children with the loaded results. */
export function Gate({ children }: { children: (d: ReturnType<typeof useData>) => ReactNode }) {
  const d = useData();
  if (d.loading) return <div className="glass flex items-center gap-3 p-8"><Loader2 className="h-5 w-5 animate-spin text-volt" /> Loading results from the econometric service…</div>;
  if (d.error || !d.R) return (
    <div className="glass border-bear/50 p-8"><div className="flex items-center gap-2 text-lg text-bear"><AlertTriangle /> Could not load results</div>
      <p className="mt-2 text-sm text-silver/80">{d.error}</p>
      <p className="mt-3 text-sm text-silver/70">Start the FastAPI service (<code className="font-mono">cd backend &amp;&amp; uvicorn app.main:app --port 8000</code>) and make sure results exist
        (<code className="font-mono">python run_pipeline.py</code> or upload a CSV on the Data Explorer page). No placeholder data is shown.</p>
      <div className="mt-4"><Btn onClick={d.reload}>Retry</Btn></div></div>);
  return <>{children(d)}</>;
}

export function Table({ head, rows, mono = true }: { head: string[]; rows: ReactNode[][]; mono?: boolean }) {
  return (<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-edge text-xs uppercase tracking-wider text-silver/60">
    {head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-edge/50 hover:bg-white/[0.03]">{r.map((c, j) => <td key={j} className={clsx("whitespace-nowrap px-3 py-1.5", mono && j > 0 && "font-mono")}>{c}</td>)}</tr>)}</tbody></table></div>);
}
