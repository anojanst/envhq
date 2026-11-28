import { apiError } from "@/lib/api";

/**
 * Refuses CLI binaries from before crypto suite v2 (docs/CRYPTO_SUITE.md).
 * Edge-safe: a header check, no database.
 *
 * Everything EnvHQ stores is now AES-256-GCM / P-256 / PBKDF2, which a CLI
 * built on the old suite can't read. Rather than let such a binary fetch
 * ciphertext and fail with "Wrong passphrase" or an AEAD error, every bearer
 * request must say it speaks v2 (`X-EnvHQ-Crypto: 2`, sent by `envhq`'s
 * `request()`). Old binaries print the server's `error` text verbatim, so
 * this message is what their user sees.
 *
 * Cookie (browser) requests are never checked — the web app is always
 * current. `/api/cli/*` is exempt: it is the frozen login exchange
 * (CLAUDE.md, "Frozen CLI wire contracts"), and an old binary that logs in
 * successfully is refused on its next call with this same instruction.
 */
export const CRYPTO_HEADER = "x-envhq-crypto";
export const CRYPTO_VERSION = "2";

export const OUTDATED_CLIENT_MESSAGE =
  "This version of the envhq CLI can't read EnvHQ's current encryption. " +
  "Update it with `npm install -g envhq@latest` (or bump the version your CI pins) and try again.";

export function outdatedClientResponse(pathname: string, headers: Headers): Response | null {
  if (!pathname.startsWith("/api/") || pathname.startsWith("/api/cli/")) return null;
  if (!headers.get("authorization")?.startsWith("Bearer ")) return null;
  if (headers.get(CRYPTO_HEADER) === CRYPTO_VERSION) return null;
  return apiError(OUTDATED_CLIENT_MESSAGE, 426);
}
