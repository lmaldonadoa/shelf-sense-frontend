import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid flaky filesystem cache corruption on Windows in local dev.
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
