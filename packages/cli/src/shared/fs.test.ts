import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileExists, ensureGitignored } from "./fs.ts";

const scratch = () => mkdtemp(join(tmpdir(), "envhq-fs-"));
const readGitignore = (dir: string) => readFile(join(dir, ".gitignore"), "utf8");

test("fileExists distinguishes present from absent", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "there"), "x");

  assert.equal(await fileExists(join(dir, "there")), true);
  assert.equal(await fileExists(join(dir, "not-there")), false);
});

test("ensureGitignored creates .gitignore when absent", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await ensureGitignored(dir);
  assert.equal(await readGitignore(dir), ".envhq/\n");
});

test("ensureGitignored is idempotent", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));

  await ensureGitignored(dir);
  await ensureGitignored(dir);
  await ensureGitignored(dir);
  assert.equal(await readGitignore(dir), ".envhq/\n", "never appended twice");
});

test("ensureGitignored appends a newline first when the file lacks a trailing one", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, ".gitignore"), "node_modules/");

  await ensureGitignored(dir);
  assert.equal(await readGitignore(dir), "node_modules/\n.envhq/\n");
});

test("ensureGitignored preserves existing entries", async (t) => {
  const dir = await scratch();
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, ".gitignore"), "dist/\n.env\n");

  await ensureGitignored(dir);
  assert.equal(await readGitignore(dir), "dist/\n.env\n.envhq/\n");
});
