import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultKdfLimits,
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
} from "./index.ts";

test("deriveMasterKey is deterministic for the same passphrase + salt + limits", async () => {
  const salt = await generateSalt();
  const limits = await defaultKdfLimits();
  const a = await deriveMasterKey("correct horse battery staple", salt, limits);
  const b = await deriveMasterKey("correct horse battery staple", salt, limits);
  assert.deepEqual(a, b);
});

test("deriveMasterKey differs for a different passphrase", async () => {
  const salt = await generateSalt();
  const a = await deriveMasterKey("correct horse battery staple", salt);
  const b = await deriveMasterKey("wrong passphrase", salt);
  assert.notDeepEqual(a, b);
});

test("wrapPrivateKey / unwrapPrivateKey round-trip via a passphrase-derived Master Key", async () => {
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey("hunter2 hunter2 hunter2", salt);
  const { privateKey } = await generateKeypair();

  const wrapped = await wrapPrivateKey(privateKey, masterKey);
  const unwrapped = await unwrapPrivateKey(wrapped, masterKey);
  assert.equal(unwrapped, privateKey);
});

test("unwrapPrivateKey fails with the wrong Master Key", async () => {
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey("right passphrase", salt);
  const wrongKey = await deriveMasterKey("wrong passphrase", salt);
  const { privateKey } = await generateKeypair();

  const wrapped = await wrapPrivateKey(privateKey, masterKey);
  await assert.rejects(() => unwrapPrivateKey(wrapped, wrongKey));
});

test("recovery key independently unwraps the same private key as the passphrase path", async () => {
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey("my passphrase", salt);
  const recoveryKey = await generateRecoveryKey();
  const { privateKey } = await generateKeypair();

  const wrappedByPassphrase = await wrapPrivateKey(privateKey, masterKey);
  const wrappedByRecovery = await wrapPrivateKey(privateKey, recoveryKey);

  const viaPassphrase = await unwrapPrivateKey(wrappedByPassphrase, masterKey);
  const viaRecovery = await unwrapPrivateKey(wrappedByRecovery, recoveryKey);
  assert.equal(viaPassphrase, privateKey);
  assert.equal(viaRecovery, privateKey);
});

test("sealToPublicKey / unsealWithPrivateKey round-trip (DEK-to-member wrap shape)", async () => {
  const { publicKey, privateKey } = await generateKeypair();
  const dek = await generateDek();
  const dekB64 = Buffer.from(dek).toString("base64");

  const sealed = await sealToPublicKey(dekB64, publicKey);
  const opened = await unsealWithPrivateKey(sealed, publicKey, privateKey);
  assert.equal(opened, dekB64);
});

test("encryptValue / decryptValue round-trip and detect tampering", async () => {
  const dek = await generateDek();
  const encrypted = await encryptValue(dek, "sk_live_super_secret");
  const decrypted = await decryptValue(dek, encrypted);
  assert.equal(decrypted, "sk_live_super_secret");

  const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -4) + "AAAA" };
  await assert.rejects(() => decryptValue(dek, tampered));
});

test("tagValue is equal for identical plaintext, different for different plaintext", async () => {
  const dek = await generateDek();
  const tagA1 = await tagValue(dek, "same-value");
  const tagA2 = await tagValue(dek, "same-value");
  const tagB = await tagValue(dek, "different-value");
  assert.equal(tagA1, tagA2);
  assert.notEqual(tagA1, tagB);
});

test("tagValue differs across two different DEKs for the same plaintext", async () => {
  const dek1 = await generateDek();
  const dek2 = await generateDek();
  const tag1 = await tagValue(dek1, "same-value");
  const tag2 = await tagValue(dek2, "same-value");
  assert.notEqual(tag1, tag2);
});

test("encodeBase64 / decodeBase64 round-trip raw key bytes", async () => {
  const dek = await generateDek();
  assert.deepEqual(decodeBase64(encodeBase64(dek)), dek);
});

test("a generated DEK survives generate -> encode -> seal -> unseal -> decode and still decrypts values (the PR2 project-key flow)", async () => {
  const { publicKey, privateKey } = await generateKeypair();
  const dek = await generateDek();

  const sealed = await sealToPublicKey(encodeBase64(dek), publicKey);
  const unsealedDek = decodeBase64(await unsealWithPrivateKey(sealed, publicKey, privateKey));

  const encrypted = await encryptValue(dek, "sk_live_abc123");
  assert.equal(await decryptValue(unsealedDek, encrypted), "sk_live_abc123");
});

test("recovery phrase encode/decode round-trips and tolerates dashes/case", async () => {
  const key = await generateRecoveryKey();
  const phrase = encodeRecoveryPhrase(key);
  assert.match(phrase, /^[0-9A-Z-]+$/);

  const decoded = decodeRecoveryPhrase(phrase);
  assert.deepEqual(decoded, key);

  const messy = phrase.toLowerCase().replaceAll("-", " ");
  assert.deepEqual(decodeRecoveryPhrase(messy), key);
});
