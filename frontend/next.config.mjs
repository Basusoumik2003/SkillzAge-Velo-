// File: SkillzAge-Velo-/frontend/next.config.mjs

import os from "node:os";
import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // This project lives inside a OneDrive-synced folder. OneDrive's sync
  // agent locks/moves files while webpack is mid-write, which makes its
  // persistent filesystem cache fail intermittently with errors like
  // "ENOENT: no such file or directory, rename '...0.pack.gz_' -> '...0.pack.gz'"
  // and can leave a corrupted cache that later crashes the dev server with
  // "Cannot find module './<id>.js'". Redirecting the cache directory to the
  // OS temp dir (outside the synced tree) avoids that entirely.
  webpack: (config, { dev }) => {
    if (dev && config.cache && config.cache.type === "filesystem") {
      config.cache.cacheDirectory = path.join(os.tmpdir(), "skillzage-frontend-webpack-cache");
    }
    return config;
  },

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
      },

      // The Python service routes (chat/project/github/deliverables) are
      // called from the frontend without an /api prefix (see src/lib/*.js,
      // which use the unprefixed `api` axios instance). Route those through
      // the gateway's /api/* proxy, which already strips the prefix before
      // forwarding to the Python service.
      {
        source: "/chat/:path*",
        destination: `${process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"}/api/chat/:path*`
      },
      {
        source: "/project/:path*",
        destination: `${process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"}/api/project/:path*`
      },
      {
        source: "/github/:path*",
        destination: `${process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"}/api/github/:path*`
      },
      {
        source: "/deliverables/:path*",
        destination: `${process.env.GATEWAY_INTERNAL_URL || "http://skillzage-gateway:8001"}/api/deliverables/:path*`
      }
    ];
  }
};

export default nextConfig;
