import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
    unoptimized: true,
  },
  serverExternalPackages: ["tesseract.js", "sharp"],
  turbopack: {
    resolveAlias: {
      canvas: { browser: "", default: "canvas" },
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
