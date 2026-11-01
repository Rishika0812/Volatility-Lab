"use client";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useMemo } from "react";
/** Cinematic post-processing (bloom glow + vignette). Lighter variant on phones/touch devices. Must be rendered inside <Canvas>. */
export default function Fx({ intensity = 0.9 }: { intensity?: number }) {
  const lite = useMemo(() => typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768), []);
  return (<EffectComposer multisampling={0}><Bloom intensity={lite ? intensity * 0.7 : intensity} luminanceThreshold={0.28} luminanceSmoothing={0.35} mipmapBlur={!lite} />{lite ? <></> : <Vignette eskil={false} offset={0.2} darkness={0.75} />}</EffectComposer>);
}
