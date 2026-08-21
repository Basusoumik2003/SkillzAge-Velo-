// File: SkillzAge-Velo-/frontend/next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // The frontend server proxies API requests to the gateway. Override this
  // when the gateway uses a different Docker service name or host.
  env: {
    GATEWAY_INTERNAL_URL:
      process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"
  },

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
        destination: `${process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"}/api/auth/:path*`
      },

      // All other API requests → Gateway service
      {
        source: "/api/:path*",
        destination: `${process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"}/api/:path*`
      }
    ];
  }
};

export default nextConfig;
