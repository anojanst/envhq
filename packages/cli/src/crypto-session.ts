import {
  deriveMasterKey,
  unwrapPrivateKey,
  unsealWithPrivateKey,
  decodeRecoveryPhrase,
  decodeBase64,
} from "@envhq/crypto";
import { readGlobalConfig } from "./config.ts";
import { apiClient, ApiError } from "./api.ts";
import { promptHidden, promptVisible } from "./auth/passphrase.ts";
import { loadCachedKeypair, storeCachedKeypair, type CachedKeypair } from "./crypto-store.ts";

/**
 * Resolves the caller's unwrapped User Keypair (M6 PR5): the OS-keychain
 * cache from a previous unlock, or an interactive passphrase/recovery-phrase
 * prompt. The CLI never *creates* a User Keypair — that only happens once,
 * via the web app's Settings > Security onboarding (PR1) — so a caller who
 * hasn't done that gets pointed there instead of an in-CLI setup flow.
 */
export async function resolveKeypair(): Promise<CachedKeypair> {
  const config = await readGlobalConfig();
  if (!config) throw new Error("Not logged in. Run `envhq login` first.");

  const cached = loadCachedKeypair(config.url);
  if (cached) return cached;

  return unlockInteractive(config.url);
}

export async function unlockInteractive(url: string): Promise<CachedKeypair> {
  let keys;
  try {
    keys = await apiClient.getUserKeys();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Error(
        "You haven't set up end-to-end encryption yet. Open the EnvHQ web app → Settings → " +
          "Security to set it up, then run this again.",
      );
    }
    throw err;
  }

  const mode = (await promptVisible("Unlock with (p)assphrase or (r)ecovery phrase? [p] ")).toLowerCase();
  let privateKey: string;

  if (mode === "r") {
    const phrase = await promptVisible("Recovery phrase: ");
    const recoveryKey = decodeRecoveryPhrase(phrase);
    try {
      privateKey = await unwrapPrivateKey(
        { ciphertext: keys.wrappedPrivateKeyByRecovery, nonce: keys.wrappedPrivateKeyByRecoveryNonce },
        recoveryKey,
      );
    } catch {
      throw new Error("That recovery phrase didn't work.");
    }
  } else {
    const passphrase = await promptHidden("Passphrase: ");
    const masterKey = await deriveMasterKey(passphrase, keys.kdfSalt, {
      t: keys.kdfT,
      m: keys.kdfM,
      p: keys.kdfP,
    });
    try {
      privateKey = await unwrapPrivateKey(
        { ciphertext: keys.wrappedPrivateKey, nonce: keys.wrappedPrivateKeyNonce },
        masterKey,
      );
    } catch {
      throw new Error("Wrong passphrase.");
    }
  }

  const keypair: CachedKeypair = { publicKey: keys.publicKey, privateKey };
  try {
    storeCachedKeypair(url, keypair);
  } catch {
    // No keychain available — proceed for this run only, without caching.
  }
  return keypair;
}

/**
 * Resolves a project's DEK for the caller, given their already-unwrapped
 * keypair. A 404 here means "authorized for the project, but no one has
 * shared its key with you yet" (PLAN.md §6 — authorization and decryption
 * capability are separate; sharing/re-wrapping is M6 PR6).
 */
export async function resolveProjectDek(projectId: string, keypair: CachedKeypair): Promise<Uint8Array> {
  let res;
  try {
    res = await apiClient.getProjectKey(projectId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Error(
        "You don't have an encryption key for this project yet. Ask an admin to open it in the " +
          "web app so it can be shared with you.",
      );
    }
    throw err;
  }
  const dekB64 = await unsealWithPrivateKey(res.wrappedDek, keypair.publicKey, keypair.privateKey);
  return decodeBase64(dekB64);
}
