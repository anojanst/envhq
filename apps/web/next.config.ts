import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared parser is published as TypeScript source, so Next must transpile it.
  transpilePackages: ["@env-sync/parser"],
};

export default nextConfig;
