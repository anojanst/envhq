import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendFileCommand, fileCommandBlock, maskCommands, maskTargets } from "./github.ts";

/**
 * What the runner's secret masker is told. Masking is per literal string, so
 * these pin every shape a value is registered in — the ticket's gotcha is
 * that multi-line and base64'd values leak if only the raw value is masked.
 */

test("a single-line value is masked as itself and as base64", () => {
  assert.deepEqual(maskTargets("s3cr3t"), ["s3cr3t", Buffer.from("s3cr3t").toString("base64")]);
});

test("a multi-line value is masked line by line, plus its base64 and JSON-escaped forms", () => {
  const pem = "-----BEGIN KEY-----\nMIIabc\nMIIdef\n-----END KEY-----";
  const targets = maskTargets(pem);
  for (const line of pem.split("\n")) assert.ok(targets.includes(line), `line ${line} is masked`);
  assert.ok(targets.includes(Buffer.from(pem).toString("base64")));
  assert.ok(targets.includes(JSON.stringify(pem).slice(1, -1)), "the \\n-escaped form is masked");
});

test("CRLF line endings are split the same way", () => {
  assert.ok(maskTargets("one\r\ntwo").includes("two"));
  assert.ok(!maskTargets("one\r\ntwo").includes("two\r"));
});

test("empty and whitespace-only fragments are never masked", () => {
  assert.deepEqual(maskTargets(""), []);
  assert.deepEqual(maskTargets("   "), []);
  assert.ok(!maskTargets("a\n\n  \nb").some((t) => t.trim() === ""));
});

test("mask commands escape workflow-command data and deduplicate across values", () => {
  const lines = maskCommands([
    { key: "A", value: "100%" },
    { key: "B", value: "100%" },
  ]);
  assert.equal(lines.filter((l) => l === "::add-mask::100%25").length, 1);
  for (const l of lines) assert.match(l, /^::add-mask::[^\n\r]+$/);
});

test("file command blocks use a heredoc whose delimiter can't appear in the value", () => {
  const block = fileCommandBlock("MULTI", "line one\nline two");
  const [header, ...rest] = block.split("\n");
  const delimiter = header!.slice("MULTI<<".length);
  assert.match(delimiter, /^ghadelimiter_/);
  assert.deepEqual(rest, ["line one", "line two", delimiter, ""]);
});

test("a value can't smuggle a second variable into GITHUB_ENV", () => {
  const block = fileCommandBlock("SAFE", "x\nEVIL=1");
  // The injected line sits inside the heredoc body, not on a line of its own.
  const delimiter = block.split("\n")[0]!.slice("SAFE<<".length);
  assert.ok(block.endsWith(`EVIL=1\n${delimiter}\n`));
});

test("names that would break the file command are refused", () => {
  assert.throws(() => fileCommandBlock("A=B", "v"));
  assert.throws(() => fileCommandBlock("A\nB", "v"));
});

test("appendFileCommand writes every pair to the file the runner named", async () => {
  const dir = await mkdtemp(join(tmpdir(), "envhq-gh-"));
  const path = join(dir, "env");
  const previous = process.env.GITHUB_ENV;
  process.env.GITHUB_ENV = path;
  try {
    await appendFileCommand("GITHUB_ENV", [
      { key: "A", value: "1" },
      { key: "B", value: "two\nlines" },
    ]);
    const written = await readFile(path, "utf8");
    assert.match(written, /^A<<ghadelimiter_[^\n]+\n1\nghadelimiter_[^\n]+\nB<<ghadelimiter_[^\n]+\ntwo\nlines\nghadelimiter_[^\n]+\n$/);
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ENV;
    else process.env.GITHUB_ENV = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("appendFileCommand outside Actions fails instead of silently doing nothing", async () => {
  const previous = process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_OUTPUT;
  try {
    await assert.rejects(() => appendFileCommand("GITHUB_OUTPUT", [{ key: "A", value: "1" }]), /GITHUB_OUTPUT/);
  } finally {
    if (previous !== undefined) process.env.GITHUB_OUTPUT = previous;
  }
});
