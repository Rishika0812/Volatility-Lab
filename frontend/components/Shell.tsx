"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { ReactNode, useEffect, useState } from "react";
import { Activity, BarChart3, BookOpen, Boxes, Database, FlaskConical, Gauge, GitCompare, Home, LineChart, Menu, Scale, ShieldCheck, Sparkles, Waves, X } from "lucide-react";

const BgScene = dynamic(() => import("./BgScene"), { ssr: false });
export const PAGES = [
  ["/", "Home", Home], ["/market", "Market overview", LineChart], ["/data", "Data explorer", Database], ["/statistics", "Descriptive stats", BarChart3],
  ["/stationarity", "Stationarity & ARCH", Waves], ["/garch", "GARCH lab", Gauge], ["/egarch", "EGARCH lab", FlaskConical], ["/studio", "Analysis studio 3D", Boxes],
  ["/robustness", "COVID & robustness", ShieldCheck], ["/comparison", "Model comparison", GitCompare], ["/findings", "Findings", Scale], ["/methodology", "Methodology", BookOpen],
] as const;

export default function Shell({ children }: { children: ReactNode }) {
  const p = usePathname(); const [open, setOpen] = useState(false); const [bg, setBg] = useState(false);
  useEffect(() => { const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; setBg(!reduce && window.innerWidth > 768); }, []);
  useEffect(() => setOpen(false), [p]);
  const links = PAGES.map(([h, l, Icon]) => (
    <Link key={h} href={h} className={clsx("group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", p === h ? "bg-gradient-to-r from-volt/30 to-violet/20 text-white shadow-[0_0_18px_#5b6cff40] ring-1 ring-volt/40" : "text-silver/65 hover:bg-white/5 hover:text-white")}>
      <Icon className={clsx("h-4 w-4", p === h ? "text-violet" : "text-silver/50 group-hover:text-volt")} />{l}{h === "/studio" && <Sparkles className="ml-auto h-3.5 w-3.5 text-violet" />}</Link>));
  return (<div className="min-h-screen lg:pl-64">
    {bg && <BgScene />}
    <aside className={clsx("fixed inset-y-0 left-0 z-50 flex flex-col w-64 border-r border-edge bg-black/70 p-4 backdrop-blur-xl transition-transform lg:translate-x-0 overflow-y-auto", open ? "translate-x-0" : "-translate-x-full")}>
      <Link href="/" className="mb-6 flex items-center gap-2 px-2 text-lg font-semibold tracking-[0.2em] text-white"><Activity className="h-6 w-6 text-violet drop-shadow-[0_0_8px_#9b5cff]" />VOLATILITY<span className="text-volt">LAB</span></Link>
      <div className="mb-2 px-3 text-[10px] uppercase tracking-[0.3em] text-silver/40">Research</div><nav className="space-y-1">{links}</nav>
    </aside>
    <div className="sticky top-0 z-40 flex items-center justify-between border-b border-edge bg-black/70 px-4 py-2 backdrop-blur lg:hidden"><span className="font-semibold tracking-widest text-white">VOLATILITY<span className="text-volt">LAB</span></span>
      <button onClick={() => setOpen(!open)} aria-label="menu">{open ? <X /> : <Menu />}</button></div>
    <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 lg:px-8">{children}</main>
    <footer className="border-t border-edge py-6 text-center text-xs text-silver/40 lg:pl-0">Made by Rishika Bhatt</footer>
  </div>);
}
