import { encryptValue, decryptValue } from "@envhq/crypto";
import type { EnvPair } from "@envhq/parser";
import type { EncryptedPair } from "../api.ts";
import { resolveKeypair, resolveProjectDek } from "../crypto-session.ts";
import type { CachedKeypair } from "../crypto-store.ts";

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
