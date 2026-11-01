// If BACKEND_URL is set, proxy /api/* to the external Python service.
// Otherwise, Next.js serves the built-in econometric dataset routes.
const BACKEND = process.env.BACKEND_URL;

export default {
  reactStrictMode: true,
  transpilePackages: ["three"],
  async rewrites() {
    if (BACKEND) {
      return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
    }
    return [];
  },
};
