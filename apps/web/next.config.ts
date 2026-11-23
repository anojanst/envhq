import path from "node:path";
import type { NextConfig } from "next";

// The self-hosted Docker image builds with NEXT_OUTPUT=standalone: a
// self-contained server.js plus only the node_modules it needs. Traced from
// the repo root so the workspace packages come along. Vercel builds without
// it and is unaffected.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  // Shared source-exported workspace packages — Next must transpile them.
  transpilePackages: ["@envhq/parser", "@envhq/crypto"],
  ...(standalone ? { output: "standalone", outputFileTracingRoot: path.join(__dirname, "../..") } : {}),
};

export default nextConfig;
