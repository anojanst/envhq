import crypto from "node:crypto";

/**
 * Symmetric encryption for env values at rest.
 *
 * AES-256-GCM with a 96-bit random IV per value and an auth tag, so a stolen
 * DB dump reveals nothing without ENV_ENCRYPTION_KEY. Runs server-side only
 * (Node runtime) — never import this into client components or edge routes.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function getKey(): Buffer {
  const b64 = process.env.ENV_ENCRYPTION_KEY;
  if (!b64) throw new Error("ENV_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("ENV_ENCRYPTION_KEY must decode to 32 bytes (base64-encoded)");
  }
  return key;
}

export interface Encrypted {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encrypt(plaintext: string): Encrypted {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt({ ciphertext, iv, authTag }: Encrypted): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Generate a new personal access token (shown to the user once). */
export function generateToken(): string {
  return "envsync_" + crypto.randomBytes(24).toString("base64url");
}

/** Hash a token for storage/lookup (only the hash is ever persisted). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
