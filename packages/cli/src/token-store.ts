import { Entry } from "@napi-rs/keyring";

/**
 * Where the CLI keeps its secret token.
 *
 * Read precedence:
 *   1. `ENVHQ_TOKEN` env var — headless / CI. Never persisted.
 *   2. OS keychain (macOS Keychain, Windows Credential Manager, libsecret) via
 *      `@napi-rs/keyring`, keyed by server url so multiple servers coexist.
 *   3. A pre-rebrand entry stored under the old "envsync" service name — if
 *      found, it's copied into the new "envhq" entry (and the old one removed)
 *      so upgrading the CLI doesn't silently log anyone out.
 *
 * Writes only ever go to the keychain. If no keychain is available we refuse to
 * persist and point the user at `ENVHQ_TOKEN` — there is no plaintext token
 * file, ever.
 */

const SERVICE = "envhq";
const LEGACY_SERVICE = "envsync";

export interface StoredSession {
  token: string;
  expiresAt?: string;
  userId?: string;
}

export interface ResolvedToken extends StoredSession {
  source: "env" | "keychain";
}

/** Build a keychain entry for a server url, or null if the keychain is absent. */
function entryFor(url: string, service = SERVICE): Entry | null {
  try {
    return new Entry(service, url);
  } catch {
    return null;
  }
}

/** The raw `ENVHQ_TOKEN`, if set and non-empty. */
export function envToken(): string | null {
  const t = process.env.ENVHQ_TOKEN?.trim();
  return t ? t : null;
}

/** True when a usable OS keychain is present on this machine. */
export function keychainAvailable(): boolean {
  return entryFor("__probe__") !== null;
}

function parseStoredValue(raw: string): StoredSession {
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed && typeof parsed.token === "string") return parsed;
  } catch {
    // Legacy value stored as a bare token string.
  }
  return { token: raw };
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
  if (raw) return { ...parseStoredValue(raw), source: "keychain" };

  // Nothing under the new service — check the pre-rebrand "envsync" entry and
  // migrate it transparently so upgrading the CLI doesn't log anyone out.
  const legacyEntry = entryFor(url, LEGACY_SERVICE);
  if (!legacyEntry) return null;

  let legacyRaw: string | null = null;
  try {
    legacyRaw = legacyEntry.getPassword();
  } catch {
    return null;
  }
  if (!legacyRaw) return null;

  const session = parseStoredValue(legacyRaw);
  try {
    entry.setPassword(legacyRaw);
    legacyEntry.deletePassword();
  } catch {
    // Best-effort migration — still return the session even if the write failed.
  }
  return { ...session, source: "keychain" };
}

/** Persist a session to the keychain. Throws if no keychain is available. */
export function storeSession(url: string, session: StoredSession): void {
  const entry = entryFor(url);
  if (!entry) {
    throw new Error(
      "No OS keychain is available to store credentials securely.\n" +
        "Set ENVHQ_TOKEN=<token> in your environment instead (recommended for CI).",
    );
  }
  entry.setPassword(JSON.stringify(session));
}

/** Remove any stored session for a server url (new and legacy service names). */
export function clearSession(url: string): void {
  for (const service of [SERVICE, LEGACY_SERVICE]) {
    const entry = entryFor(url, service);
    if (!entry) continue;
    try {
      entry.deletePassword();
    } catch {
      // Nothing stored — nothing to clear.
    }
  }
}
