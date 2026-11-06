import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure client demo — no server proxy of relay traffic.
  transpilePackages: ["@relay-mesh/crypto"],
  reactStrictMode: true,
};

export default nextConfig;
