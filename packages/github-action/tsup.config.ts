import { defineConfig } from "tsup";

/**
 * GitHub runs `dist/index.cjs` straight from the repository — there is no
 * install step for a JavaScript action — so the bundle is committed, and it
 * is CommonJS so it doesn't depend on a package.json sitting beside it once
 * this directory is mirrored into its own repository.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["cjs"],
  outExtension: () => ({ js: ".cjs" }),
  target: "node24",
  platform: "node",
  clean: true,
});
