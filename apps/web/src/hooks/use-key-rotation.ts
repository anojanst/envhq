"use client";

import { useCallback, useState } from "react";
import { decryptValue, encryptValue, generateDek, sealToPublicKey, encodeBase64 } from "@envhq/crypto";
import { api } from "@/lib/client";

/**
 * DEK rotation on revoke — orchestrates re-encrypting a project's live
 * `env_vars` under a freshly generated DEK and re-wrapping it to every
 * currently authorized member, so a revoked member's cached copy of the old
 * DEK becomes useless against current values. See `lib/project-keys.ts`'s
 * `migrateVarsBatch`/`finalizeRotation` doc comment for the two-phase
 * server design this mirrors (batch re-encrypt, then an irreversible
 * finalize once everything's confirmed migrated).
 */

export type RotationPhase =
  | "idle"
  | "fetching"
  | "reencrypting"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

export interface RunRotationArgs {
  projectId: string;
  currentDek: Uint8Array;
  targetKeyVersion: number;
  environmentIds: string[];
  /** Every currently authorized member with a public key — must exactly match the project's real membership, or finalize rejects it. */
  members: { userId: string; publicKey: string }[];
}

const UPLOAD_CHUNK_SIZE = 200;

export function useKeyRotation() {
  const [phase, setPhase] = useState<RotationPhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (args: RunRotationArgs) => {
    const { projectId, currentDek, targetKeyVersion, environmentIds, members } = args;
    setError(null);
    try {
      setPhase("fetching");
      const rows: { id: string; ciphertext: string; iv: string }[] = [];
      for (const environmentId of environmentIds) {
        const res = await api<{ vars: { id: string; ciphertext: string; iv: string }[] }>(
          `/api/environments/${environmentId}`,
        );
        rows.push(...res.vars.map((v) => ({ id: v.id, ciphertext: v.ciphertext, iv: v.iv })));
      }

      setPhase("reencrypting");
      const newDek = await generateDek();
      const reencrypted = await Promise.all(
        rows.map(async (row) => {
          const plaintext = await decryptValue(currentDek, { ciphertext: row.ciphertext, nonce: row.iv });
          const { ciphertext, nonce } = await encryptValue(newDek, plaintext);
          return { id: row.id, ciphertext, iv: nonce };
        }),
      );

      setPhase("uploading");
      for (let i = 0; i < reencrypted.length; i += UPLOAD_CHUNK_SIZE) {
        const chunk = reencrypted.slice(i, i + UPLOAD_CHUNK_SIZE);
        await api(`/api/projects/${projectId}/keys/rotate`, {
          method: "POST",
          body: { targetKeyVersion, rows: chunk },
        });
      }

      setPhase("finalizing");
      const newDekB64 = encodeBase64(newDek);
      const wraps = await Promise.all(
        members.map(async (m) => ({
          subjectUserId: m.userId,
          wrappedDek: await sealToPublicKey(newDekB64, m.publicKey),
        })),
      );
      await api(`/api/projects/${projectId}/keys/rotate/finalize`, {
        method: "POST",
        body: { targetKeyVersion, wraps },
      });

      setPhase("done");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Rotation failed");
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
  }, []);

  return { phase, error, run, reset };
}
