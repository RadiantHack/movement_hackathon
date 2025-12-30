import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// PWA disabled - no caching
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: true, // Completely disable PWA to prevent caching
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
  swcMinify: true,
  workboxOptions: {
    disableDevLogs: true,
    skipWaiting: false,
    clientsClaim: false,
    // Disable all caching strategies
    runtimeCaching: [],
  },
  // Exclude all routes from precaching
  exclude: [/.*/],
});

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  webpack: (config, { isServer }) => {
    // Handle Solana packages that may use ESM
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };

    return config;
  },
  turbopack: {},
};

export default withPWA(nextConfig);
