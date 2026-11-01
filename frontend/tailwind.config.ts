import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { navy: { 950: "#050b1f", 900: "#08122b", 800: "#0d1b3d" }, panel: "#0b1020", edge: "#1b2447",
      bull: "#2fd18b", bear: "#d1566b", volt: "#3b6bff", violet: "#9b5cff", silver: "#c9d2e6" },
    fontFamily: { sans: ["Inter","ui-sans-serif","system-ui","sans-serif"], mono: ["ui-monospace","SFMono-Regular","Menlo","monospace"] },
  } },
  plugins: [],
} satisfies Config;
