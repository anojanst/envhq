import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit runs outside Next.js, so Next's env loading doesn't happen and
// these are read explicitly — in Next's own precedence order: a real
// environment variable wins, then `.env.local`, then `.env`. dotenv never
// overwrites a key that is already set, so "first load wins" and the order
// below *is* the precedence.
//
// `.env` is read as well as `.env.local` because a plain `.env` is an
// ordinary setup and Next reads both. drizzle-kit does also load `.env`
// itself before evaluating this file, so naming only `.env.local` happens to
// work today — but that is its behaviour rather than a documented contract,
// and this file should be able to say where its own credentials come from.
//
// Both paths are relative to the working directory. That is fine because
// drizzle-kit is the only thing that loads this config and every `db:*`
// script reaches it through `pnpm --filter @envhq/web`, i.e. from
// `apps/web`. Resolving against the file instead (`import.meta.dirname`)
// does not work — drizzle-kit transpiles this config, and `import.meta` is
// empty by the time it runs.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
