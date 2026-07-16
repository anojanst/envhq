"use client";

import { useCallback, useEffect, useState } from "react";
import { unsealWithPrivateKey, decodeBase64 } from "@envhq/crypto";
import { useCryptoSession } from "@/components/crypto-session-provider";
import { api, ApiError } from "@/lib/client";

/**
 * Fetches and unseals a project's DEK using the caller's own unwrapped User
 * Keypair (from `CryptoSessionProvider`). Distinguishes:
 *   - "locked": the user hasn't unlocked their session this page load.
 *   - "uninitialized": *nobody* holds a wrap yet — the project was created
 *     before its creator ever unlocked a session (create-project-dialog's
 *     DEK registration is best-effort, gated on being unlocked at creation
 *     time). Safe for any authorized, unlocked user to self-heal by
 *     generating the first DEK, since `env_vars` can't hold anything without
 *     one to encrypt under — a genuinely empty project is the only way to
 *     reach this state.
 *   - "no-key": unlocked, a wrap exists for *someone*, just not this caller
 *     yet — a real pending-share case that must go through reconciliation
 *     (PLAN.md's authorization-vs-decryption-capability split), not a fresh
 *     DEK, or their copy of the DEK would silently diverge from everyone
 *     else's.
 */

export type ProjectDekStatus = "checking" | "locked" | "uninitialized" | "no-key" | "ready" | "error";

export interface ProjectDekState {
  status: ProjectDekStatus;
  dek: Uint8Array | null;
  /** Re-runs the fetch — for the "uninitialized" self-heal action to confirm its own write landed. */
  refetch: () => void;
}

type AsyncState = { status: "idle" | "ready" | "uninitialized" | "no-key" | "error"; dek: Uint8Array | null };

export function useProjectDek(projectId: string): ProjectDekState {
  const { status: sessionStatus, publicKey, privateKey } = useCryptoSession();
  const [asyncState, setAsyncState] = useState<AsyncState>({ status: "idle", dek: null });
  const [generation, setGeneration] = useState(0);
  const unlocked = sessionStatus === "unlocked" && !!publicKey && !!privateKey;
  const refetch = useCallback(() => setGeneration((g) => g + 1), []);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;

    api<{ wrappedDek: string }>(`/api/projects/${projectId}/keys/me`)
      .then(async (res) => {
        const dekB64 = await unsealWithPrivateKey(res.wrappedDek, publicKey!, privateKey!);
        if (!cancelled) setAsyncState({ status: "ready", dek: decodeBase64(dekB64) });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          const anyKeyExists = (err.data as { anyKeyExists?: boolean } | undefined)?.anyKeyExists;
          setAsyncState({ status: anyKeyExists ? "no-key" : "uninitialized", dek: null });
        } else {
          setAsyncState({ status: "error", dek: null });
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- publicKey/privateKey change together with `unlocked`; re-keying on `unlocked` alone avoids redundant re-fetches when they're set in the same render.
  }, [projectId, unlocked, generation]);

  if (sessionStatus === "checking") return { status: "checking", dek: null, refetch };
  if (!unlocked) return { status: "locked", dek: null, refetch };
  if (asyncState.status === "ready") return { status: "ready", dek: asyncState.dek, refetch };
  if (asyncState.status === "uninitialized") return { status: "uninitialized", dek: null, refetch };
  if (asyncState.status === "no-key") return { status: "no-key", dek: null, refetch };
  if (asyncState.status === "error") return { status: "error", dek: null, refetch };
  return { status: "checking", dek: null, refetch };
}
