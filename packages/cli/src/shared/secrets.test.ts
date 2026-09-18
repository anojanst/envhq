import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDek } from "@envhq/crypto";
import { parseEnv, serializeEnv } from "@envhq/parser";
import { encryptPairs, decryptPairs } from "./secrets.ts";

/**
 * push/pull round-trip fidelity: a file goes through parse → encrypt → (wire)
 * → decrypt → serialize and must come back with identical values. These are
 * the shapes users actually put in .env files and the ones most likely to be
 * mangled by a careless change to the encryption boundary.
 */
const AWKWARD = [
  `SIMPLE=plain`,
  `QUOTED="double quoted"`,
  `SINGLE='single quoted'`,
  `WITH_EQUALS=key=value=more`,
  `WITH_HASH="value # not a comment"`,
  `EMPTY=`,
  `SPACES="  padded  "`,
  `# a standalone comment`,
  `MULTILINE="line one\nline two\nline three"`,
  `URL=postgres://u:p@host:5432/db?sslmode=require`,
  `JSON={"a":1,"b":[2,3]}`,
].join("\n");

test("push/pull round-trips quotes, multi-line values, comments and empties", async () => {
  const dek = await generateDek();
  const parsed = parseEnv(AWKWARD);

  const encrypted = await encryptPairs(dek, parsed);
  // Nothing recognisable survives into the wire format.
  for (const e of encrypted) {
    assert.ok(e.ciphertext.length > 0);
    assert.ok(e.iv.length > 0);
    const original = parsed.find((p) => p.key === e.key)!;
    if (original.value.length > 0) {
      assert.notEqual(e.ciphertext, original.value, `${e.key} must not be stored in plaintext`);
    }
  }

  const decrypted = await decryptPairs(dek, encrypted);
  assert.deepEqual(decrypted, parsed, "values must survive the round-trip byte-for-byte");

  // And the re-serialized file parses back to the same pairs.
  assert.deepEqual(parseEnv(serializeEnv(decrypted)), parsed);
});

test("a value spanning real newlines round-trips", async () => {
  const dek = await generateDek();
  const parsed = parseEnv('KEY="-----BEGIN-----\nline two\nline three\n-----END-----"');
  assert.ok(parsed[0].value.includes("\n"), "precondition: the parser produced a real multi-line value");

  const decrypted = await decryptPairs(dek, await encryptPairs(dek, parsed));
  assert.deepEqual(decrypted, parsed);
  assert.deepEqual(parseEnv(serializeEnv(decrypted)), parsed, "and survives being written back to a file");
});

test("each encryption uses a fresh nonce", async () => {
  const dek = await generateDek();
  const pairs = [
    { key: "A", value: "same" },
    { key: "B", value: "same" },
  ];
  const [a, b] = await encryptPairs(dek, pairs);
  assert.notEqual(a.iv, b.iv, "identical plaintexts must not share a nonce");
  assert.notEqual(a.ciphertext, b.ciphertext, "identical plaintexts must not produce identical ciphertext");
});

test("a wrong DEK cannot decrypt", async () => {
  const [dek, other] = [await generateDek(), await generateDek()];
  const encrypted = await encryptPairs(dek, [{ key: "A", value: "secret" }]);
  await assert.rejects(() => decryptPairs(other, encrypted));
});
