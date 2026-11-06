import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure client demo — no server proxy of relay traffic.
  transpilePackages: ["@relay-mesh/crypto", "@relay-mesh/client"],
  reactStrictMode: true,
};

export default nextConfig;
