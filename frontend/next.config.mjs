// All /api/* calls from the browser are proxied to the FastAPI econometric service.
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";
export default {
  reactStrictMode: true,
  transpilePackages: ["three"],
  async rewrites() { return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }]; },
};
