"use client";

import { useEffect } from "react";
import { sealToPublicKey, encodeBase64 } from "@envhq/crypto";
import { api } from "@/lib/client";

/**
 * Opportunistic DEK-wrap reconciliation (M6 PR6): whenever a client already
 * holds a project's unwrapped DEK, it checks for anyone authorized for the
 * project but not yet holding a wrap (a new group member, someone granted
 * while offline, ...) and seals a copy for them. Best-effort — a viewer
 * role or a network hiccup just means the next visitor with edit access
 * picks it up instead.
 */
export async function reconcileProjectKeys(projectId: string, dek: Uint8Array): Promise<void> {
  let pending: { userId: string; publicKey: string }[];
  try {
    const res = await api<{ pending: { userId: string; publicKey: string }[] }>(
      `/api/projects/${projectId}/keys/pending`,
    );
    pending = res.pending;
  } catch {
    return;
  }
  if (pending.length === 0) return;

  const dekB64 = encodeBase64(dek);
  for (const { userId, publicKey } of pending) {
    try {
      const wrappedDek = await sealToPublicKey(dekB64, publicKey);
      await api(`/api/projects/${projectId}/keys`, {
        method: "POST",
        body: { wrappedDek, subjectUserId: userId },
      });
    } catch {
      // One failed wrap (403 for a viewer-role caller, a race with someone
      // else already wrapping it, ...) shouldn't block the rest.
    }
  }
}

/** Runs `reconcileProjectKeys` once per mount / DEK change — e.g. on every env-editor visit. Fire-and-forget: nothing here touches React state, so there's no stale-closure cleanup to do. */
export function useProjectKeyReconciliation(projectId: string, dek: Uint8Array | null) {
  useEffect(() => {
    if (!dek) return;
    void reconcileProjectKeys(projectId, dek);
  }, [projectId, dek]);
}
