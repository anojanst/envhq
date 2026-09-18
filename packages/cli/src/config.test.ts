import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * `DEFAULT_URL` is resolved once at module load, so each case re-imports the
 * module under a fresh specifier to get a clean evaluation.
 *
 * Precedence (config.ts): ENVHQ_URL → URL baked in at build → localhost.
 * Under `node --test` nothing is baked (that's tsup's `define`), so the
 * fallback is the localhost branch.
 */
let n = 0;
async function freshConfig(envUrl?: string) {
  const previous = process.env.ENVHQ_URL;
  if (envUrl === undefined) delete process.env.ENVHQ_URL;
  else process.env.ENVHQ_URL = envUrl;
  try {
    return await import(`./config.ts?case=${n++}`);
  } finally {
    if (previous === undefined) delete process.env.ENVHQ_URL;
    else process.env.ENVHQ_URL = previous;
  }
}

test("ENVHQ_URL wins over the built-in default", async () => {
  const { DEFAULT_URL } = await freshConfig("https://envhq.internal.example");
  assert.equal(DEFAULT_URL, "https://envhq.internal.example");
});

test("falls back to localhost when nothing is set or baked", async () => {
  const { DEFAULT_URL } = await freshConfig(undefined);
  assert.equal(DEFAULT_URL, "http://localhost:3000");
});

test("an empty ENVHQ_URL is still honoured as set, not treated as absent", async () => {
  // `??` only falls through on null/undefined — documenting the real behaviour
  // so a future switch to `||` is a visible decision, not an accident.
  const { DEFAULT_URL } = await freshConfig("");
  assert.equal(DEFAULT_URL, "");
});

test("CLI_VERSION falls back to the dev marker when nothing is baked", async () => {
  const { CLI_VERSION } = await freshConfig(undefined);
  assert.equal(CLI_VERSION, "0.0.0-dev");
});

test("the link file path is the frozen .envhq/config.json", async () => {
  const { LINK_FILENAME, LINK_DIRNAME } = await freshConfig(undefined);
  assert.equal(LINK_DIRNAME, ".envhq");
  assert.equal(LINK_FILENAME, ".envhq/config.json");
});
