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
      }
    ];
  }
};

export default nextConfig;