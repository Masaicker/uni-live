import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  distDir: process.env.UNI_LIVE_DIST_DIR || ".next",
  serverExternalPackages: ["playwright-core", "quickjs-emscripten"],
  devIndicators: false,
};

export default nextConfig;
