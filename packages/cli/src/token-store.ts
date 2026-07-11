import { Entry } from "@napi-rs/keyring";

/**
 * Where the CLI keeps its secret token.
 *
 * Read precedence:
 *   1. `ENVSYNC_TOKEN` env var — headless / CI. Never persisted.
 *   2. OS keychain (macOS Keychain, Windows Credential Manager, libsecret) via
 *      `@napi-rs/keyring`, keyed by server url so multiple servers coexist.
 *
 * Writes only ever go to the keychain. If no keychain is available we refuse to
 * persist and point the user at `ENVSYNC_TOKEN` — there is no plaintext token
 * file, ever.
 */

const SERVICE = "envsync";

export interface StoredSession {
  token: string;
  expiresAt?: string;
  userId?: string;
}

export interface ResolvedToken extends StoredSession {
  source: "env" | "keychain";
}

/** Build a keychain entry for a server url, or null if the keychain is absent. */
function entryFor(url: string): Entry | null {
  try {
    return new Entry(SERVICE, url);
  } catch {
    return null;
  }
}

/** The raw `ENVSYNC_TOKEN`, if set and non-empty. */
export function envToken(): string | null {
  const t = process.env.ENVSYNC_TOKEN?.trim();
  return t ? t : null;
}

/** True when a usable OS keychain is present on this machine. */
export function keychainAvailable(): boolean {
  return entryFor("__probe__") !== null;
}

/** Resolve the token to authenticate with (env var wins over keychain). */
export function resolveToken(url: string): ResolvedToken | null {
  const env = envToken();
  if (env) return { token: env, source: "env" };

  const entry = entryFor(url);
  if (!entry) return null;

  let raw: string | null = null;
  try {
    raw = entry.getPassword();
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed && typeof parsed.token === "string") return { ...parsed, source: "keychain" };
  } catch {
    // Legacy value stored as a bare token string.
  }
  return { token: raw, source: "keychain" };
}

/** Persist a session to the keychain. Throws if no keychain is available. */
export function storeSession(url: string, session: StoredSession): void {
  const entry = entryFor(url);
  if (!entry) {
    throw new Error(
      "No OS keychain is available to store credentials securely.\n" +
        "Set ENVSYNC_TOKEN=<token> in your environment instead (recommended for CI).",
    );
  }
  entry.setPassword(JSON.stringify(session));
}

/** Remove any stored session for a server url. */
export function clearSession(url: string): void {
  const entry = entryFor(url);
  if (!entry) return;
  try {
    entry.deletePassword();
  } catch {
    // Nothing stored — nothing to clear.
  }
}
