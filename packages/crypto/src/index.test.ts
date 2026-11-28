import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, createHmac, pbkdf2Sync } from "node:crypto";
import {
  PBKDF2_ITERATIONS,
  defaultKdfParams,
  generateSalt,
  deriveMasterKey,
  generateKeypair,
  wrapPrivateKey,
  unwrapPrivateKey,
  sealToPublicKey,
  unsealWithPrivateKey,
  generateDek,
  encryptValue,
  decryptValue,
  tagValue,
  generateRecoveryKey,
  encodeRecoveryPhrase,
  decodeRecoveryPhrase,
  encodeBase64,
  decodeBase64,
  publicKeyFingerprint,
} from "./index.ts";

// Keep unit tests fast: the real iteration count is only exercised once.
const FAST = { alg: "pbkdf2-sha256" as const, iterations: 1000 };

test("defaultKdfParams is PBKDF2-SHA256 at OWASP's 600,000 iterations", () => {
  assert.deepEqual(defaultKdfParams(), { alg: "pbkdf2-sha256", iterations: 600_000 });
  assert.equal(PBKDF2_ITERATIONS, 600_000);
});

test("deriveMasterKey at the default cost is deterministic and 32 bytes", async () => {
  const salt = await generateSalt();
  const a = await deriveMasterKey("correct horse battery staple", salt);
  const b = await deriveMasterKey("correct horse battery staple", salt, defaultKdfParams());
  assert.equal(a.length, 32);
  assert.deepEqual(a, b);
});

test("deriveMasterKey differs for a different passphrase, salt or cost", async () => {
  const salt = await generateSalt();
  const base = await deriveMasterKey("pw", salt, FAST);
  assert.notDeepEqual(base, await deriveMasterKey("pw2", salt, FAST));
  assert.notDeepEqual(base, await deriveMasterKey("pw", await generateSalt(), FAST));
  assert.notDeepEqual(base, await deriveMasterKey("pw", salt, { ...FAST, iterations: 1001 }));
});

test("deriveMasterKey matches an independent PBKDF2 (Node's OpenSSL), with NFKC normalisation", async () => {
  const salt = await generateSalt();
  const ours = await deriveMasterKey("pássphrase", salt, FAST);
  const theirs = pbkdf2Sync("pássphrase".normalize("NFKC"), Buffer.from(salt, "base64"), 1000, 32, "sha256");
  assert.deepEqual(Buffer.from(ours), theirs);
});

test("deriveMasterKey refuses a KDF it doesn't know (e.g. an old Argon2id row)", async () => {
  const salt = await generateSalt();
  await assert.rejects(
    () => deriveMasterKey("pw", salt, { alg: "argon2id", iterations: 2 } as never),
    /format EnvHQ no longer reads/,
  );
});

test("keypairs are P-256: a 65-byte uncompressed public point, a PKCS#8 private key", async () => {
  const { publicKey, privateKey } = await generateKeypair();
  const raw = decodeBase64(publicKey);
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 0x04);
  assert.equal(decodeBase64(privateKey)[0], 0x30, "PKCS#8 is a DER SEQUENCE");
});

test("publicKeyFingerprint is a SHA-256 prefix, so P-256 keys don't all look alike", async () => {
  const { createHash } = await import("node:crypto");
  const a = await generateKeypair();
  const b = await generateKeypair();
  const fa = await publicKeyFingerprint(a.publicKey);
  assert.match(fa, /^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
  const expected = createHash("sha256").update(Buffer.from(a.publicKey, "base64")).digest("hex").slice(0, 16).toUpperCase();
  assert.equal(fa.replaceAll(" ", ""), expected);
  assert.notEqual(fa, await publicKeyFingerprint(b.publicKey));
});

test("private-key wraps round-trip and refuse the wrong key", async () => {
  const salt = await generateSalt();
  const mk = await deriveMasterKey("right", salt, FAST);
  const wrong = await deriveMasterKey("wrong", salt, FAST);
  const { privateKey } = await generateKeypair();
  const wrapped = await wrapPrivateKey(privateKey, mk);
  assert.equal(decodeBase64(wrapped.nonce).length, 12);
  assert.equal(await unwrapPrivateKey(wrapped, mk), privateKey);
  await assert.rejects(() => unwrapPrivateKey(wrapped, wrong));
});

test("the recovery key independently unwraps the same private key as the passphrase path", async () => {
  const mk = await deriveMasterKey("my passphrase", await generateSalt(), FAST);
  const recoveryKey = await generateRecoveryKey();
  const { privateKey } = await generateKeypair();
  assert.equal(await unwrapPrivateKey(await wrapPrivateKey(privateKey, mk), mk), privateKey);
  assert.equal(await unwrapPrivateKey(await wrapPrivateKey(privateKey, recoveryKey), recoveryKey), privateKey);
});

test("seal/unseal round-trips, and only the recipient can open it", async () => {
  const alice = await generateKeypair();
  const mallory = await generateKeypair();
  const dek = encodeBase64(await generateDek());
  const sealed = await sealToPublicKey(dek, alice.publicKey);
  assert.equal(decodeBase64(sealed).length, 65 + 32 + 16);
  assert.equal(await unsealWithPrivateKey(sealed, alice.publicKey, alice.privateKey), dek);
  await assert.rejects(() => unsealWithPrivateKey(sealed, mallory.publicKey, mallory.privateKey));
  // Bound to the recipient's public key: naming another key fails even with the right private key.
  await assert.rejects(() => unsealWithPrivateKey(sealed, mallory.publicKey, alice.privateKey));
});

test("seals are randomised: sealing the same DEK twice gives different blobs", async () => {
  const { publicKey } = await generateKeypair();
  const dek = encodeBase64(await generateDek());
  assert.notEqual(await sealToPublicKey(dek, publicKey), await sealToPublicKey(dek, publicKey));
});

test("sealing to an old X25519 public key is refused with a clear message", async () => {
  const x25519Shaped = encodeBase64(new Uint8Array(32).fill(7));
  await assert.rejects(() => sealToPublicKey(encodeBase64(new Uint8Array(32)), x25519Shaped), /no longer reads/);
});

test("values round-trip (including non-ASCII) and detect tampering", async () => {
  const dek = await generateDek();
  const encrypted = await encryptValue(dek, "sk_live_super_secret ✓");
  assert.equal(await decryptValue(dek, encrypted), "sk_live_super_secret ✓");
  const bytes = decodeBase64(encrypted.ciphertext);
  bytes[0] ^= 1;
  await assert.rejects(() => decryptValue(dek, { ...encrypted, ciphertext: encodeBase64(bytes) }));
  await assert.rejects(async () => decryptValue(await generateDek(), encrypted));
});

test("value ciphertext is standard AES-256-GCM (checked with Node's OpenSSL)", async () => {
  const dek = await generateDek();
  const encrypted = await encryptValue(dek, "cross-checked");
  const ct = Buffer.from(encrypted.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", dek, Buffer.from(encrypted.nonce, "base64"));
  decipher.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
  assert.equal(plain.toString(), "cross-checked");
});

test("an old XChaCha value (24-byte nonce) is refused with a clear message", async () => {
  const dek = await generateDek();
  const old = { ciphertext: encodeBase64(new Uint8Array(40)), nonce: encodeBase64(new Uint8Array(24)) };
  await assert.rejects(() => decryptValue(dek, old), /no longer reads/);
});

test("tagValue is HMAC-SHA256 under the DEK", async () => {
  const dek = await generateDek();
  assert.equal(await tagValue(dek, "v"), createHmac("sha256", dek).update("v").digest("base64"));
  assert.notEqual(await tagValue(dek, "v"), await tagValue(await generateDek(), "v"));
});

test("the whole flow: passphrase → keypair → sealed DEK → values, via either unlock path", async () => {
  const mk = await deriveMasterKey("pw pw pw", await generateSalt(), FAST);
  const recoveryKey = await generateRecoveryKey();
  const kp = await generateKeypair();
  const byPass = await wrapPrivateKey(kp.privateKey, mk);
  const byRecovery = await wrapPrivateKey(kp.privateKey, recoveryKey);
  const dek = await generateDek();
  const sealed = await sealToPublicKey(encodeBase64(dek), kp.publicKey);
  const value = await encryptValue(dek, "postgres://x");

  for (const priv of [await unwrapPrivateKey(byPass, mk), await unwrapPrivateKey(byRecovery, recoveryKey)]) {
    const opened = decodeBase64(await unsealWithPrivateKey(sealed, kp.publicKey, priv));
    assert.equal(await decryptValue(opened, value), "postgres://x");
  }
});

test("encodeBase64 / decodeBase64 round-trip raw key bytes", async () => {
  const dek = await generateDek();
  assert.deepEqual(decodeBase64(encodeBase64(dek)), dek);
});

test("recovery phrase encode/decode round-trips and tolerates dashes/case", async () => {
  const key = await generateRecoveryKey();
  const phrase = encodeRecoveryPhrase(key);
  assert.match(phrase, /^[0-9A-Z-]+$/);
  assert.deepEqual(decodeRecoveryPhrase(phrase), key);
  assert.deepEqual(decodeRecoveryPhrase(phrase.toLowerCase().replaceAll("-", " ")), key);
});
