import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared source-exported workspace packages — Next must transpile them.
  transpilePackages: ["@envhq/parser", "@envhq/crypto"],
};

export default nextConfig;
