// File: SkillzAge-Velo-/frontend/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" }
    ]
  },

  async rewrites() {
    return [
      // Auth service
      {
        source: "/api/auth/:path*",
        destination: "http://127.0.0.1:5000/api/auth/:path*"
      },

      // All other API requests → Gateway service
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8001/api/:path*"
      },

      // frontend/src/lib/api.js's plain `api` client calls these at the
      // root (no /api prefix), matching how gatewayService mounts them
      // directly (Backend/gatewayService/src/app.js) - without these,
      // API_BASE_URL="" resolves them against this Next.js app's own
      // origin instead of the gateway, and every call 404s.
      { source: "/chat/:path*", destination: "http://127.0.0.1:8001/chat/:path*" },
      { source: "/deliverables/:path*", destination: "http://127.0.0.1:8001/deliverables/:path*" }
    ];
  }
};

export default nextConfig;