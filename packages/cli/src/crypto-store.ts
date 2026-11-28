import { Entry } from "@napi-rs/keyring";

/**
 * Where the CLI caches the caller's *unwrapped* User Keypair after a
 * passphrase/recovery-phrase unlock, so `push`/`pull`/`diff` don't
 * re-prompt on every command — same trust model and `@napi-rs/keyring`
 * dependency as the session bearer token in `token-store.ts`, just a
 * separate keychain service so the two never collide. There is no
 * plaintext-file fallback here (same as tokens): no keychain means no
 * caching, and the user re-unlocks every command.
 */

const SERVICE = "envhq-zk";

export interface CachedKeypair {
  publicKey: string;
  privateKey: string;
}

function entryFor(url: string): Entry | null {
  try {
    return new Entry(SERVICE, url);
  } catch {
    return null;
  }
}

export function loadCachedKeypair(url: string): CachedKeypair | null {
  const entry = entryFor(url);
  if (!entry) return null;
  try {
    const raw = entry.getPassword();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedKeypair>;
    if (!parsed?.publicKey || !parsed?.privateKey) return null;
    // A keypair cached before crypto suite v2 is X25519 (a 32-byte public key);
    // nothing it could open exists any more, so unlock again instead.
    if (Buffer.from(parsed.publicKey, "base64").length !== 65) return null;
    return parsed as CachedKeypair;
  } catch {
    return null;
  }
}

/** Throws if no keychain is available — callers should treat that as "proceed without caching," not a hard failure. */
export function storeCachedKeypair(url: string, keypair: CachedKeypair): void {
  const entry = entryFor(url);
  if (!entry) throw new Error("No OS keychain is available to cache your encryption key.");
  entry.setPassword(JSON.stringify(keypair));
}

export function clearCachedKeypair(url: string): void {
  const entry = entryFor(url);
  if (!entry) return;
  try {
    entry.deletePassword();
  } catch {
    // Nothing stored — nothing to clear.
  }
}
