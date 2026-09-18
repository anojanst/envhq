import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLinkConfig, defaultFileFor, describeLinkMapping, resolveLinkedEnv, requireLink } from "./link.ts";
import type { LinkConfig } from "../config.ts";

/**
 * Note: the failure branches of `resolveLinkedEnv`/`requireLink` call `fail()`,
 * which is `process.exit(1)` — they'd take the test runner down with them, so
 * they're covered by the CLI-surface test running a real subprocess instead.
 */

const LINK: LinkConfig = {
  projectId: "p_1",
  projectName: "acme",
  environments: { dev: { id: "e_1", file: ".env" }, prod: { id: "e_2", file: ".env.prod" } },
  default: "dev",
};

test("the default environment maps to .env, others to .env.<name>", () => {
  assert.equal(defaultFileFor("dev", "dev"), ".env");
  assert.equal(defaultFileFor("prod", "dev"), ".env.prod");
  assert.equal(defaultFileFor("dev", "prod"), ".env.dev");
});

test("buildLinkConfig prefers dev as the default environment", () => {
  const link = buildLinkConfig({ id: "p", name: "acme" }, [
    { id: "e1", name: "prod" },
    { id: "e2", name: "dev" },
  ] as never);
  assert.equal(link.default, "dev");
  assert.deepEqual(link.environments, {
    prod: { id: "e1", file: ".env.prod" },
    dev: { id: "e2", file: ".env" },
  });
});

test("buildLinkConfig falls back to the first environment when there is no dev", () => {
  const link = buildLinkConfig({ id: "p", name: "acme" }, [
    { id: "e1", name: "staging" },
    { id: "e2", name: "prod" },
  ] as never);
  assert.equal(link.default, "staging");
  assert.equal(link.environments.staging.file, ".env", "the default always maps to plain .env");
});

test("resolveLinkedEnv defaults to the link's default environment", () => {
  assert.deepEqual(resolveLinkedEnv(LINK), { name: "dev", id: "e_1", file: ".env" });
  assert.deepEqual(resolveLinkedEnv(LINK, "prod"), { name: "prod", id: "e_2", file: ".env.prod" });
});

test("describeLinkMapping renders every mapping", () => {
  assert.equal(describeLinkMapping(LINK), "dev → .env, prod → .env.prod");
});

test("requireLink returns the link config for a linked folder", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "envhq-require-"));
  const cwd = process.cwd();
  t.after(async () => {
    process.chdir(cwd);
    await rm(dir, { recursive: true, force: true });
  });
  await mkdir(join(dir, ".envhq"), { recursive: true });
  await writeFile(join(dir, ".envhq/config.json"), JSON.stringify(LINK));

  process.chdir(dir);
  assert.deepEqual(await requireLink(), LINK);
});
