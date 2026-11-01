"use client";
/** Phone-friendly 3D container: on touch screens, one finger scrolls the page until the user taps "Rotate 3D". */
import { ReactNode, useEffect, useState } from "react";
import { Hand, Lock } from "lucide-react";

export default function TouchGate({ children, className = "" }: { children: (enabled: boolean) => ReactNode; className?: string }) {
  const [coarse, setCoarse] = useState(false); const [on, setOn] = useState(false);
  useEffect(() => { setCoarse(window.matchMedia("(pointer: coarse)").matches); }, []);
  const enabled = !coarse || on;
  return (<div className={`relative ${enabled ? "" : "lock3d"} ${className}`}>{children(enabled)}
    {coarse && <button onClick={() => setOn(!on)} className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full border border-volt/50 bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur">
      {on ? <><Lock className="h-3.5 w-3.5" /> Lock (scroll page)</> : <><Hand className="h-3.5 w-3.5" /> Rotate 3D</>}</button>}</div>);
}
