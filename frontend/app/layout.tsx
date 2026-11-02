import "./globals.css";
import type { Metadata, Viewport } from "next";
import { DataProvider } from "@/lib/api";
import Shell from "@/components/Shell";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = { title: "VOLATILITY LAB – Asymmetric Volatility in the Indian Equity Market", description: "Interactive 3D econometric research platform: GARCH & EGARCH on the Nifty 50." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#02040c" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="font-sans antialiased"><DataProvider><Shell>{children}</Shell></DataProvider><Analytics /></body></html>);
}
