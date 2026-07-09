import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv, serializeEnv, pairsToRecord } from "./index.ts";

test("basic KEY=value and export prefix", () => {
  const r = pairsToRecord(parseEnv("FOO=bar\nexport BAZ=qux"));
  assert.deepEqual(r, { FOO: "bar", BAZ: "qux" });
});

test("comments and blank lines ignored", () => {
  const r = pairsToRecord(parseEnv("# comment\n\nFOO=bar\n   # indented\nBAZ=1"));
  assert.deepEqual(r, { FOO: "bar", BAZ: "1" });
});

test("value containing = signs (e.g. base64)", () => {
  const r = pairsToRecord(parseEnv("TOKEN=abc==def="));
  assert.equal(r.TOKEN, "abc==def=");
});

test("inline comment stripped only after whitespace", () => {
  const r = pairsToRecord(parseEnv("A=hello # trailing\nB=he#llo"));
  assert.equal(r.A, "hello");
  assert.equal(r.B, "he#llo");
});

test("double-quoted with escapes", () => {
  const r = pairsToRecord(parseEnv('MSG="line1\\nline2\\t!"'));
  assert.equal(r.MSG, "line1\nline2\t!");
});

test("single-quoted is literal", () => {
  const r = pairsToRecord(parseEnv("RAW='no\\nescape # keep'"));
  assert.equal(r.RAW, "no\\nescape # keep");
});

test("multiline quoted value (PEM-like)", () => {
  const pem = 'KEY="-----BEGIN-----\nline\n-----END-----"';
  const r = pairsToRecord(parseEnv(pem));
  assert.equal(r.KEY, "-----BEGIN-----\nline\n-----END-----");
});

test("duplicate key: last wins, position kept", () => {
  const pairs = parseEnv("A=1\nB=2\nA=3");
  assert.deepEqual(pairs, [
    { key: "A", value: "3" },
    { key: "B", value: "2" },
  ]);
});

test("invalid keys skipped", () => {
  const r = pairsToRecord(parseEnv("1BAD=x\nGOOD=y\nno-eq-line"));
  assert.deepEqual(r, { GOOD: "y" });
});

test("round-trip: serialize then parse is stable", () => {
  const original = [
    { key: "SIMPLE", value: "value" },
    { key: "SPACED", value: "has spaces" },
    { key: "HASH", value: "a#b c" },
    { key: "MULTI", value: "l1\nl2" },
    { key: "QUOTE", value: 'a"b' },
    { key: "EMPTY", value: "" },
  ];
  const reparsed = parseEnv(serializeEnv(original));
  assert.deepEqual(reparsed, original);
});
