import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLinkConfig } from "./config.ts";

/**
 * Link-file migration from the pre-rebrand layouts. These paths are frozen —
 * a user who linked a folder with an old CLI must keep working after upgrading,
 * without re-running `envhq link`. See the wire contracts in CLAUDE.md.
 */

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), "envhq-link-"));
}

const exists = async (p: string) => access(p).then(() => true, () => false);

const LINK = {
  projectId: "p_1",
  projectName: "acme",
  environments: { dev: { id: "e_1", file: ".env" }, prod: { id: "e_2", file: ".env.prod" } },
  default: "dev",
};

test("reads the current .envhq/config.json untouched", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".envhq"), { recursive: true });
  await writeFile(join(dir, ".envhq/config.json"), JSON.stringify(LINK));

  assert.deepEqual(await readLinkConfig(dir), LINK);
});

test("migrates the pre-rebrand .envsync/config.json and removes the old dir", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".envsync"), { recursive: true });
  await writeFile(join(dir, ".envsync/config.json"), JSON.stringify(LINK));

  assert.deepEqual(await readLinkConfig(dir), LINK, "returns the config on the migrating read");
  assert.deepEqual(
    JSON.parse(await readFile(join(dir, ".envhq/config.json"), "utf8")),
    LINK,
    "and persists it at the new path",
  );
  assert.equal(await exists(join(dir, ".envsync")), false, "old dir is removed");

  // Second read goes straight to the new file.
  assert.deepEqual(await readLinkConfig(dir), LINK);
});

test("migrates the older single-env .envsync.json into an environments map", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(
    join(dir, ".envsync.json"),
    JSON.stringify({ projectId: "p_9", projectName: "legacy", environmentId: "e_9", environmentName: "staging" }),
  );

  assert.deepEqual(await readLinkConfig(dir), {
    projectId: "p_9",
    projectName: "legacy",
    environments: { staging: { id: "e_9", file: ".env" } },
    default: "staging",
  });
  assert.equal(await exists(join(dir, ".envsync.json")), false, "old file is removed");
});

test("the current file wins over a stale legacy one", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".envhq"), { recursive: true });
  await mkdir(join(dir, ".envsync"), { recursive: true });
  await writeFile(join(dir, ".envhq/config.json"), JSON.stringify(LINK));
  await writeFile(
    join(dir, ".envsync/config.json"),
    JSON.stringify({ ...LINK, projectName: "stale" }),
  );

  const got = await readLinkConfig(dir);
  assert.equal(got?.projectName, "acme");
  assert.equal(await exists(join(dir, ".envsync")), true, "an unread legacy dir is left alone");
});

test("an unlinked folder reads as null", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(await readLinkConfig(dir), null);
});

test("malformed JSON reads as unlinked rather than throwing", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, ".envhq"), { recursive: true });
  await writeFile(join(dir, ".envhq/config.json"), "{ not json");
  assert.equal(await readLinkConfig(dir), null);
});
