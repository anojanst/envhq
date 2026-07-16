import { argon2idAsync } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { randomBytes, concatBytes } from "@noble/hashes/utils.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";

/**
 * Zero-knowledge crypto primitives (M6), shared by `apps/web` (browser) and
 * `packages/cli` (Node) so both clients derive/wrap/encrypt identically and
 * the server never needs to. Pure, source-exported, no server dependency —
 * same pattern as `packages/parser`.
 *
 * Built on `@noble/*` (pure TS/JS, no WASM) rather than libsodium: the
 * published `libsodium-wrappers-sumo` ESM build (the variant with Argon2id)
 * is broken — its `.mjs` does a relative `import "./libsodium-sumo.mjs"`
 * that doesn't exist in the published package — and the non-sumo
 * `libsodium-wrappers` build's WASM binary doesn't actually include Argon2id
 * at all despite listing its JS bindings. `@noble/*` sidesteps the whole
 * WASM-loading/packaging class of problem and needs no `ready()` gate.
 *
 * All byte values cross this module's public API as base64 strings (to match
 * the base64 already used for ciphertext/iv/authTag elsewhere in the app) —
 * callers never handle raw `Uint8Array`s except for symmetric keys (Master
 * Key, DEK, Recovery Key), which are only ever passed into other functions
 * in this module, never persisted as-is.
 *
 * One symmetric primitive (XChaCha20-Poly1305) does double duty: wrapping
 * the User Keypair's private key under the Master Key / Recovery Key, and
 * encrypting env-var values under a project DEK — same AEAD, different key.
 * Public-key wrapping (`sealToPublicKey`/`unsealWithPrivateKey`) is a
 * hand-rolled anonymous sealed box — X25519 ECDH with a fresh ephemeral
 * keypair, HKDF-derived key+nonce, same construction libsodium's
 * `crypto_box_seal` uses internally — since `@noble/curves` only exposes
 * the ECDH primitive, not a pre-built sealed-box wrapper.
 */

const SALT_BYTES = 16;
const NONCE_BYTES = 24; // xchacha20poly1305
const DEK_BYTES = 32;
const RECOVERY_KEY_BYTES = 32;

function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Public base64 codec for raw key bytes (a DEK, a Master Key, a Recovery
 * Key) — every "secret" this module wraps/seals is a base64 *string*, but
 * `generateDek()`/`deriveMasterKey()`/etc. return raw `Uint8Array` (since
 * that's what `encryptValue`/`tagValue` need directly). Callers moving a key
 * between "generate it" and "wrap/seal it" need to cross that boundary
 * themselves — this is that crossing, exposed rather than duplicated at
 * every call site.
 */
export const encodeBase64 = base64Encode;
export const decodeBase64 = base64Decode;

export interface WrappedSecret {
  ciphertext: string;
  nonce: string;
}

export interface Keypair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedValue {
  ciphertext: string;
  nonce: string;
}

/** Argon2id cost parameters to persist alongside a KDF salt, so re-deriving later uses the same work factor. `m` is in KiB. */
export interface KdfLimits {
  t: number;
  m: number;
  p: number;
}

/**
 * OWASP's minimum-recommended Argon2id baseline (19 MiB / 2 passes /
 * single-threaded — parallelism doesn't help a pure-JS implementation).
 * This KDF runs on every unlock, not just once, so it favors staying under
 * ~1s in the browser over the higher resistance of a "sensitive"-tier
 * config; heavier tiers pushed multi-second derivations (measured ~3s at 64
 * MiB/t=3) that would make every unlock feel broken.
 */
export async function defaultKdfLimits(): Promise<KdfLimits> {
  return { t: 2, m: 19456, p: 1 };
}

export async function generateSalt(): Promise<string> {
  return base64Encode(randomBytes(SALT_BYTES));
}

/** Passphrase → Argon2id → 32-byte Master Key, used only to wrap/unwrap the User Keypair. */
export async function deriveMasterKey(passphrase: string, salt: string, limits?: KdfLimits): Promise<Uint8Array> {
  const { t, m, p } = limits ?? (await defaultKdfLimits());
  return argon2idAsync(passphrase.normalize("NFKC"), base64Decode(salt), { t, m, p, dkLen: 32 });
}

/** The User Keypair (X25519) — generated once at ZK onboarding, wrapped by both the passphrase-derived Master Key and a separate Recovery Key. */
export async function generateKeypair(): Promise<Keypair> {
  const kp = x25519.keygen();
  return { publicKey: base64Encode(kp.publicKey), privateKey: base64Encode(kp.secretKey) };
}

/** Symmetric wrap (XChaCha20-Poly1305) of a base64 secret under a raw key — used for both Master-Key and Recovery-Key wraps of the private key, which are otherwise identical operations. */
export async function wrapWithKey(secret: string, key: Uint8Array): Promise<WrappedSecret> {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(base64Decode(secret));
  return { ciphertext: base64Encode(ciphertext), nonce: base64Encode(nonce) };
}

export async function unwrapWithKey(wrapped: WrappedSecret, key: Uint8Array): Promise<string> {
  const plaintext = xchacha20poly1305(key, base64Decode(wrapped.nonce)).decrypt(base64Decode(wrapped.ciphertext));
  return base64Encode(plaintext);
}

export const wrapPrivateKey = wrapWithKey;
export const unwrapPrivateKey = unwrapWithKey;

/** HKDF-derives the sealed-box key+nonce from an ECDH shared secret, binding it to both the ephemeral and recipient public keys (mirrors libsodium's `crypto_box_seal` construction). */
function deriveSealKeyMaterial(
  sharedSecret: Uint8Array,
  ephemeralPublicKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): { key: Uint8Array; nonce: Uint8Array } {
  const okm = hkdf(sha256, sharedSecret, undefined, concatBytes(ephemeralPublicKey, recipientPublicKey), 32 + NONCE_BYTES);
  return { key: okm.slice(0, 32), nonce: okm.slice(32, 32 + NONCE_BYTES) };
}

/** Wraps a secret (e.g. a project DEK) to a recipient's public key — only their private key can open it. Used to grant project access without the server ever holding the DEK. */
export async function sealToPublicKey(secret: string, publicKey: string): Promise<string> {
  const recipientPublicKey = base64Decode(publicKey);
  const eph = x25519.keygen();
  const shared = x25519.getSharedSecret(eph.secretKey, recipientPublicKey);
  const { key, nonce } = deriveSealKeyMaterial(shared, eph.publicKey, recipientPublicKey);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(base64Decode(secret));
  return base64Encode(concatBytes(eph.publicKey, ciphertext));
}

export async function unsealWithPrivateKey(sealed: string, publicKey: string, privateKey: string): Promise<string> {
  const bytes = base64Decode(sealed);
  const ephemeralPublicKey = bytes.slice(0, 32);
  const ciphertext = bytes.slice(32);
  const shared = x25519.getSharedSecret(base64Decode(privateKey), ephemeralPublicKey);
  const { key, nonce } = deriveSealKeyMaterial(shared, ephemeralPublicKey, base64Decode(publicKey));
  const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);
  return base64Encode(plaintext);
}

/** A fresh per-project Data Encryption Key (32 bytes, for XChaCha20-Poly1305). */
export async function generateDek(): Promise<Uint8Array> {
  return randomBytes(DEK_BYTES);
}

/** Encrypts one env-var value under a project DEK. */
export async function encryptValue(dek: Uint8Array, plaintext: string): Promise<EncryptedValue> {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = xchacha20poly1305(dek, nonce).encrypt(new TextEncoder().encode(plaintext));
  return { ciphertext: base64Encode(ciphertext), nonce: base64Encode(nonce) };
}

export async function decryptValue(dek: Uint8Array, encrypted: EncryptedValue): Promise<string> {
  const plaintext = xchacha20poly1305(dek, base64Decode(encrypted.nonce)).decrypt(base64Decode(encrypted.ciphertext));
  return new TextDecoder().decode(plaintext);
}

/**
 * Keyed hash (BLAKE2b) of a plaintext value under the project DEK, stored
 * alongside ciphertext so the server can decide "same value or a real
 * conflict?" during a version-commit race without ever decrypting (two
 * different nonces produce different ciphertext for the same plaintext, so
 * ciphertext equality can't be used for this).
 */
export async function tagValue(dek: Uint8Array, plaintext: string): Promise<string> {
  const tag = blake2b(new TextEncoder().encode(plaintext), { key: dek, dkLen: 32 });
  return base64Encode(tag);
}

// Crockford base32: 32 unambiguous characters (no I/L/O/U), case-insensitive on decode.
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += CROCKFORD_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += CROCKFORD_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = CROCKFORD_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid recovery phrase character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** A fresh 32-byte Recovery Key — the second, independent unwrap path for the User Keypair (PLAN.md §6's mandatory Recovery Kit). */
export async function generateRecoveryKey(): Promise<Uint8Array> {
  return randomBytes(RECOVERY_KEY_BYTES);
}

/** Formats a recovery key as a human-transcribable, dash-grouped phrase (e.g. `A3F9K-...`). */
export function encodeRecoveryPhrase(recoveryKey: Uint8Array): string {
  const encoded = base32Encode(recoveryKey);
  return encoded.match(/.{1,5}/g)?.join("-") ?? encoded;
}

/** Parses a recovery phrase back to raw key bytes. Tolerant of dashes, spacing, and case. */
export function decodeRecoveryPhrase(phrase: string): Uint8Array {
  return base32Decode(phrase);
}
