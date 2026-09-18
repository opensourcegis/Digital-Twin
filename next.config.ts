import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["cesium"],
  // Cloud VMs and some browsers hit the dev server via 127.0.0.1; without this,
  // Next.js blocks HMR/WebSocket resources and Turbopack client chunks can stall.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
