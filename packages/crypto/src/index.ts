/**
 * Zero-knowledge crypto primitives (M6), shared by `apps/web` (browser) and
 * `packages/cli` (Node) so both clients derive/wrap/encrypt identically and
 * the server never needs to. Pure, source-exported, no server dependency —
 * same pattern as `packages/parser`.
 *
 * INVARIANT: the server never holds a key that can decrypt a customer's values.
 * Everything here runs client-side; the server only ever sees ciphertext and
 * keys already sealed to a member's public key. A change that would require the
 * server to decrypt — or that moves any of this behind an API call — breaks the
 * product's core claim. Raise it rather than designing around it. See the
 * Invariants section of CLAUDE.md.
 *
 * APPROVED ALGORITHMS ON THE PLATFORM'S MODULE (docs/CRYPTO_SUITE.md). Only
 * FIPS-approved algorithms, and only through WebCrypto (`crypto.subtle`), so
 * the work is done by the platform's own crypto module — BoringSSL/NSS in
 * browsers, OpenSSL in Node — never by JavaScript in this package. EnvHQ
 * isn't seeking certification; this is about not having visible gaps.
 *
 *   values, private-key wraps   AES-256-GCM, random 12-byte IV
 *   user / deploy keypairs      ECDH P-256 (public: raw 65-byte point; private: PKCS#8)
 *   sealing a DEK to a key      ephemeral ECDH P-256 → HKDF-SHA256 → AES-256-GCM
 *   passphrase → Master Key     PBKDF2-HMAC-SHA256, 600,000 iterations
 *   keyed value tag             HMAC-SHA256
 *
 * This replaced an earlier suite (XChaCha20-Poly1305 / X25519 / Argon2id on
 * `@noble/*`) in a clean break — migration 0018 deleted everything it had
 * encrypted. Don't add a pure-JS primitive back; if WebCrypto can't do it,
 * raise it.
 *
 * All byte values cross this module's public API as base64 strings —
 * callers never handle raw `Uint8Array`s except for symmetric keys (Master
 * Key, DEK, Recovery Key), which are only ever passed into other functions
 * in this module, never persisted as-is.
 *
 * Browsers only expose `crypto.subtle` in a secure context (HTTPS or
 * localhost). A self-hosted instance on plain HTTP at a LAN address can't
 * encrypt; `subtle()` says so rather than failing obscurely.
 */

const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const PUBLIC_KEY_BYTES = 65;

/** OWASP's 2023 figure for PBKDF2-HMAC-SHA256. Runs on every unlock — well under a second in WebCrypto. */
export const PBKDF2_ITERATIONS = 600_000;

const SEAL_INFO = new TextEncoder().encode("envhq/seal/v2");
const P256 = { name: "ECDH", namedCurve: "P-256" } as const;

// ---------------------------------------------------------------------------
// Encoding

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
 * that's what `encryptValue` needs directly). Callers moving a key between
 * "generate it" and "wrap/seal it" cross that boundary here.
 */
export const encodeBase64 = base64Encode;
export const decodeBase64 = base64Decode;

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// WebCrypto plumbing

function webcrypto(): typeof globalThis.crypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new Error(
      "This browser isn't exposing Web Crypto, which EnvHQ's encryption needs. " +
        "Open EnvHQ over HTTPS (or localhost) and try again.",
    );
  }
  return c;
}

function subtle(): typeof globalThis.crypto.subtle {
  return webcrypto().subtle;
}

/** WebCrypto's typings want an ArrayBuffer-backed view; every array here is one. */
function bs(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as Uint8Array<ArrayBuffer>;
}

function randomBytes(length: number): Uint8Array {
  return webcrypto().getRandomValues(new Uint8Array(length));
}

async function aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey("raw", bs(key), "AES-GCM", false, ["encrypt"]);
  return new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: bs(iv) }, k, bs(plaintext)));
}

async function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
  if (iv.length !== IV_BYTES || ciphertext.length < TAG_BYTES) throw new Error(LEGACY_FORMAT);
  const k = await subtle().importKey("raw", bs(key), "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: bs(iv) }, k, bs(ciphertext)));
}

const LEGACY_FORMAT =
  "This was encrypted in a format EnvHQ no longer reads. Set up encryption again, then re-enter the values.";

// ---------------------------------------------------------------------------
// Passphrase → Master Key

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

/** How a Master Key is derived, persisted beside its salt so a later unlock repeats it exactly. */
export interface KdfParams {
  alg: "pbkdf2-sha256";
  iterations: number;
}

export function defaultKdfParams(): KdfParams {
  return { alg: "pbkdf2-sha256", iterations: PBKDF2_ITERATIONS };
}

export async function generateSalt(): Promise<string> {
  return base64Encode(randomBytes(SALT_BYTES));
}

/** Passphrase → PBKDF2-HMAC-SHA256 → 32-byte Master Key, used only to wrap/unwrap the User Keypair. */
export async function deriveMasterKey(
  passphrase: string,
  salt: string,
  params: KdfParams = defaultKdfParams(),
): Promise<Uint8Array> {
  if (params.alg !== "pbkdf2-sha256") throw new Error(LEGACY_FORMAT);
  const pass = new TextEncoder().encode(passphrase.normalize("NFKC"));
  const base = await subtle().importKey("raw", bs(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: bs(base64Decode(salt)), iterations: params.iterations },
    base,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

// ---------------------------------------------------------------------------
// User / deploy keypairs

/**
 * A User (or deploy) Keypair: ECDH P-256. The public half is the raw
 * uncompressed point; the private half is PKCS#8, since WebCrypto can't
 * import a raw EC private key.
 */
export async function generateKeypair(): Promise<Keypair> {
  const kp = await subtle().generateKey(P256, true, ["deriveBits"]);
  const publicKey = new Uint8Array(await subtle().exportKey("raw", kp.publicKey));
  const privateKey = new Uint8Array(await subtle().exportKey("pkcs8", kp.privateKey));
  return { publicKey: base64Encode(publicKey), privateKey: base64Encode(privateKey) };
}

/**
 * A short, comparable fingerprint of a public key: the first 8 bytes of its
 * SHA-256, as hex in groups of four (`3F9A 0C12 …`). Hashed, not truncated —
 * every raw P-256 key starts with the same `0x04` byte, so a prefix of the key
 * itself would look alike for everyone.
 */
export async function publicKeyFingerprint(publicKey: string): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", bs(base64Decode(publicKey))));
  const hex = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{4}/g)!.join(" ");
}

/** Symmetric wrap (AES-256-GCM) of a base64 secret under a raw key — the Master-Key and Recovery-Key wraps of the private key. */
export async function wrapWithKey(secret: string, key: Uint8Array): Promise<WrappedSecret> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await aesGcmEncrypt(key, iv, base64Decode(secret));
  return { ciphertext: base64Encode(ciphertext), nonce: base64Encode(iv) };
}

export async function unwrapWithKey(wrapped: WrappedSecret, key: Uint8Array): Promise<string> {
  return base64Encode(await aesGcmDecrypt(key, base64Decode(wrapped.nonce), base64Decode(wrapped.ciphertext)));
}

export const wrapPrivateKey = wrapWithKey;
export const unwrapPrivateKey = unwrapWithKey;

// ---------------------------------------------------------------------------
// Sealing a secret (a DEK) to a public key

async function sealKeyMaterial(shared: Uint8Array, ephemeralPublic: Uint8Array, recipientPublic: Uint8Array) {
  const base = await subtle().importKey("raw", bs(shared), "HKDF", false, ["deriveBits"]);
  const okm = new Uint8Array(
    await subtle().deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: bs(concatBytes(SEAL_INFO, ephemeralPublic, recipientPublic)),
      },
      base,
      (KEY_BYTES + IV_BYTES) * 8,
    ),
  );
  return { key: okm.slice(0, KEY_BYTES), iv: okm.slice(KEY_BYTES) };
}

function importPublicKey(raw: Uint8Array) {
  if (raw.length !== PUBLIC_KEY_BYTES || raw[0] !== 0x04) throw new Error(LEGACY_FORMAT);
  return subtle().importKey("raw", bs(raw), P256, false, []);
}

/**
 * Wraps a secret (e.g. a project DEK) to a recipient's public key — only their
 * private key can open it. A fresh ephemeral P-256 keypair, ECDH with the
 * recipient, HKDF-SHA256 bound to both public keys → AES-256-GCM key + IV (the
 * IV may be derived because the key is single-use). Output:
 * `ephemeralPublicKey (65 bytes) || ciphertext+tag`.
 */
export async function sealToPublicKey(secret: string, publicKey: string): Promise<string> {
  const recipient = base64Decode(publicKey);
  const pub = await importPublicKey(recipient);
  const eph = await subtle().generateKey(P256, true, ["deriveBits"]);
  const ephPublic = new Uint8Array(await subtle().exportKey("raw", eph.publicKey));
  const shared = new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: pub }, eph.privateKey, 256));
  const { key, iv } = await sealKeyMaterial(shared, ephPublic, recipient);
  return base64Encode(concatBytes(ephPublic, await aesGcmEncrypt(key, iv, base64Decode(secret))));
}

export async function unsealWithPrivateKey(sealed: string, publicKey: string, privateKey: string): Promise<string> {
  const bytes = base64Decode(sealed);
  const ephPublic = bytes.slice(0, PUBLIC_KEY_BYTES);
  const priv = await subtle()
    .importKey("pkcs8", bs(base64Decode(privateKey)), P256, false, ["deriveBits"])
    .catch(() => {
      throw new Error(LEGACY_FORMAT);
    });
  const shared = new Uint8Array(
    await subtle().deriveBits({ name: "ECDH", public: await importPublicKey(ephPublic) }, priv, 256),
  );
  const { key, iv } = await sealKeyMaterial(shared, ephPublic, base64Decode(publicKey));
  return base64Encode(await aesGcmDecrypt(key, iv, bytes.slice(PUBLIC_KEY_BYTES)));
}

// ---------------------------------------------------------------------------
// Values

/** A fresh per-project Data Encryption Key (32 bytes, for AES-256-GCM). */
export async function generateDek(): Promise<Uint8Array> {
  return randomBytes(KEY_BYTES);
}

/** Encrypts one env-var value under a project DEK. */
export async function encryptValue(dek: Uint8Array, plaintext: string): Promise<EncryptedValue> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await aesGcmEncrypt(dek, iv, new TextEncoder().encode(plaintext));
  return { ciphertext: base64Encode(ciphertext), nonce: base64Encode(iv) };
}

export async function decryptValue(dek: Uint8Array, encrypted: EncryptedValue): Promise<string> {
  const plaintext = await aesGcmDecrypt(dek, base64Decode(encrypted.nonce), base64Decode(encrypted.ciphertext));
  return new TextDecoder().decode(plaintext);
}

/**
 * Keyed hash (HMAC-SHA256) of a plaintext under the project DEK, so two
 * clients can tell "same value" from "real conflict" without decrypting —
 * ciphertext can't be compared, since every encryption uses a fresh IV.
 */
export async function tagValue(dek: Uint8Array, plaintext: string): Promise<string> {
  const key = await subtle().importKey("raw", bs(dek), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const tag = await subtle().sign("HMAC", key, bs(new TextEncoder().encode(plaintext)));
  return base64Encode(new Uint8Array(tag));
}

// ---------------------------------------------------------------------------
// Recovery phrase

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
  return randomBytes(KEY_BYTES);
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
