import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // Bundle the workspace parser into the CLI so it ships as a single file.
  noExternal: ["@env-sync/parser"],
  banner: { js: "#!/usr/bin/env node" },
});
