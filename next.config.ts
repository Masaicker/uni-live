import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  distDir: process.env.UNI_LIVE_DIST_DIR || ".next",
  serverExternalPackages: ["playwright-core", "quickjs-emscripten"],
  devIndicators: false,
  webpack(config) {
    config.module.rules.push({
      include: [require.resolve("mpegts.js"), require.resolve("flv.js")],
      use: [{ loader: path.join(__dirname, "scripts/flv-aac-loader.cjs") }],
    });
    return config;
  },
};

export default nextConfig;
