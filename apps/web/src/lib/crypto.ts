import crypto from "node:crypto";

/**
 * Token generation/hashing for CLI auth.
 *
 * Env-value encryption used to live here too (server-side AES-256-GCM under
 * `ENV_ENCRYPTION_KEY`), but M6 PR4 moved it client-side — see
 * `packages/crypto` (used by both `apps/web` and `packages/cli`). The server
 * never encrypts or decrypts env values anymore.
 */

/** Generate a new personal access token (shown to the user once). */
export function generateToken(): string {
  return "envhq_" + crypto.randomBytes(24).toString("base64url");
}

/** Hash a token for storage/lookup (only the hash is ever persisted). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
