import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // Bundle the workspace parser into the CLI.
  noExternal: ["@env-sync/parser"],
  // The keychain is a native (.node) addon — it can't be bundled, so it stays a
  // real runtime dependency resolved from node_modules at install time.
  external: ["@napi-rs/keyring"],
  banner: { js: "#!/usr/bin/env node" },
  // Bake the default sync URL into release builds. Defaults to production, so
  // `pnpm build && npm publish` just works. Override for local artifact testing
  // with `ENVSYNC_DEFAULT_URL=http://localhost:3000 pnpm build`.
  // (Note: `pnpm dev` via tsx skips this define and falls back to localhost.)
  define: {
    __ENVSYNC_DEFAULT_URL__: JSON.stringify(
      process.env.ENVSYNC_DEFAULT_URL ?? "https://envsync.dev",
    ),
    // Bake package.json's version so `--version` can't drift from what's
    // actually published — bumping the version is the only thing to remember.
    __ENVSYNC_VERSION__: JSON.stringify(pkg.version),
  },
});
