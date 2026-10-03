import { encryptValue, decryptValue, unsealWithPrivateKey, decodeBase64 } from "@envhq/crypto";
import type { EnvPair } from "@envhq/parser";
import { apiClient, ApiError, type EncryptedPair } from "../api.ts";
import { resolveKeypair, resolveProjectDek } from "../crypto-session.ts";
import type { CachedKeypair } from "../crypto-store.ts";
import { deployKeyFromEnv, REISSUE_HINT, type DeployKeypair } from "./deploy-key.ts";

/**
 * The client-side encryption boundary for every command that touches values.
 *
 * INVARIANT: plaintext never leaves this process. The server only ever receives
 * what `encryptPairs` produces. See the Invariants section of CLAUDE.md.
 */

/** Decrypts a batch of ciphertext pairs under a project DEK into plaintext `EnvPair[]`. */
export async function decryptPairs(dek: Uint8Array, pairs: EncryptedPair[]): Promise<EnvPair[]> {
  return Promise.all(
    pairs.map(async (p) => ({
      key: p.key,
      value: await decryptValue(dek, { ciphertext: p.ciphertext, nonce: p.iv }),
    })),
  );
}

/** Encrypts a batch of plaintext pairs under a project DEK into wire-format ciphertext. */
export async function encryptPairs(dek: Uint8Array, pairs: EnvPair[]): Promise<EncryptedPair[]> {
  return Promise.all(
    pairs.map(async (p) => {
      const { ciphertext, nonce } = await encryptValue(dek, p.value);
      return { key: p.key, ciphertext, iv: nonce };
    }),
  );
}

/** Resolves the caller's keypair + this environment's project DEK together — every command that touches values needs both. */
export async function resolveDek(
  projectId: string,
): Promise<{ keypair: CachedKeypair; dek: Uint8Array }> {
  const keypair = await resolveKeypair();
  const dek = await resolveProjectDek(projectId, keypair);
  return { keypair, dek };
}

/**
 * One environment's plaintext, for the commands that hand values to
 * something else (`run`, `export`) rather than syncing a file.
 *
 * With `ENVHQ_DEPLOY_KEY` set this is the pipeline path (ADR-020): the DEK
 * comes back sealed to the deploy key and is opened here, with no keychain
 * and no prompt. Without it, the caller's own keypair is used exactly as
 * `pull` uses it.
 */
export async function fetchPlaintextEnv(projectId: string, envId: string): Promise<EnvPair[]> {
  const deployKey = deployKeyFromEnv();
  if (deployKey) return fetchWithDeployKey(envId, deployKey);

  // Without a deploy key the next step is a passphrase prompt, and a CI job
  // has nobody to answer it: ADR-020's "block forever" case. Say so instead.
  if (process.env.CI === "true" || process.env.CI === "1") {
    throw new Error(
      "ENVHQ_DEPLOY_KEY isn't set. A CI job can't unlock a personal key, so it needs a deploy key " +
        "to decrypt — issue one in the EnvHQ web app (project → Deploy keys).",
    );
  }

  const { dek } = await resolveDek(projectId);
  const { pairs } = await apiClient.exportEnv(envId);
  return decryptPairs(dek, pairs);
}

async function fetchWithDeployKey(envId: string, key: DeployKeypair): Promise<EnvPair[]> {
  let res;
  try {
    res = await apiClient.exportEnvForDeployKey(envId, key.publicKey);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      throw new Error("Environment not found, or ENVHQ_TOKEN isn't allowed to read it.");
    }
    throw err;
  }

  let dek: Uint8Array;
  try {
    dek = decodeBase64(await unsealWithPrivateKey(res.wrappedDek, key.publicKey, key.privateKey));
  } catch {
    // The server handed back the wrap it holds for this public key, so a
    // failure here means the private half isn't the one that goes with it —
    // a truncated paste, or a secret edited by hand.
    throw new Error(`ENVHQ_DEPLOY_KEY couldn't open this project's key: its private half is damaged. ${REISSUE_HINT}`);
  }

  try {
    return await decryptPairs(dek, res.pairs);
  } catch {
    // ADR-020's one unclean rotation window: a DEK from before a cutover and
    // ciphertext from after it. It fails closed, and says so in words.
    throw new Error(
      `The project's encryption key rotated while this job was running (now key version ${res.keyVersion}), ` +
        "so the values it fetched can't be decrypted. Re-run the job.",
    );
  }
}

/**
 * The message `run`/`export` exit with. On the pipeline path an API failure
 * is rewritten into something the person reading a CI log can act on; the
 * project lookup and the export can both be where it surfaces, so this
 * applies to the whole command rather than to one call.
 */
export function failureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (!(err instanceof ApiError) || !process.env.ENVHQ_DEPLOY_KEY?.trim()) return message;
  switch (err.status) {
    case 401:
      // Revoking a deploy key deletes its token in the same action, so a
      // revoked key surfaces as a rejected token, not as a 403.
      return `ENVHQ_TOKEN was rejected — the deploy key may have been revoked. ${REISSUE_HINT}`;
    case 403:
      // The export route says which of its two refusals this was; the
      // environment cap is a configuration mismatch, not a dead key.
      return /not allowed to read this environment/.test(message)
        ? `${message} It was issued for a different environment — target that one, or issue a key for this one.`
        : `${message} ${REISSUE_HINT}`;
    default:
      return message;
  }
}
