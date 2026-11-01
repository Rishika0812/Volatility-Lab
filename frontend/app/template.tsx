"use client";
import { motion } from "framer-motion";
/** 3D perspective page transition. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (<motion.div initial={{ opacity: 0, rotateX: 7, y: 26, scale: 0.985 }} animate={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }} transition={{ duration: 0.55, ease: [0.2, 0.7, 0.2, 1] }} style={{ transformPerspective: 1400, transformOrigin: "50% 0%" }}>{children}</motion.div>);
}
