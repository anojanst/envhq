"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  deriveMasterKey,
  generateKeypair,
  generateRecoveryKey,
  generateSalt,
  wrapPrivateKey,
  unwrapPrivateKey,
  encodeRecoveryPhrase,
  decodeRecoveryPhrase,
  defaultKdfLimits,
} from "@envhq/crypto";
import { api } from "@/lib/client";

/**
 * Holds the caller's unwrapped User Keypair for the browser session only —
 * in React state, never written to localStorage/IndexedDB/cookies. A page
 * refresh clears it and requires unlocking again (PLAN.md §6's device-key
 * decision: no separate device keypair, the passphrase-unwrapped User Key
 * itself is the cached secret, and on the web that cache is memory-only).
 */

type Status = "checking" | "not-set-up" | "locked" | "unlocked";

interface KeysResponse {
  publicKey: string;
  kdfSalt: string;
  kdfT: number;
  kdfM: number;
  kdfP: number;
  wrappedPrivateKey: string;
  wrappedPrivateKeyNonce: string;
  wrappedPrivateKeyByRecovery: string;
  wrappedPrivateKeyByRecoveryNonce: string;
}

interface CryptoSessionValue {
  status: Status;
  publicKey: string | null;
  /** Base64 User Keypair private key, only while `status === "unlocked"`. */
  privateKey: string | null;
  /** First-time setup: generates the keypair, wraps it two ways, persists it, and unlocks. Returns the recovery phrase to show the user exactly once. */
  setup: (passphrase: string) => Promise<{ recoveryPhrase: string }>;
  unlock: (passphrase: string) => Promise<void>;
  unlockWithRecoveryPhrase: (recoveryPhrase: string) => Promise<void>;
  lock: () => void;
}

const CryptoSessionContext = createContext<CryptoSessionValue | null>(null);

export function CryptoSessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [privateKey, setPrivateKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<KeysResponse>("/api/users/me/keys")
      .then((keys) => {
        if (cancelled) return;
        setPublicKey(keys.publicKey);
        setStatus("locked");
      })
      .catch(() => {
        if (!cancelled) setStatus("not-set-up");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setup = useCallback(async (passphrase: string) => {
    const kdfLimits = await defaultKdfLimits();
    const salt = await generateSalt();
    const masterKey = await deriveMasterKey(passphrase, salt, kdfLimits);
    const keypair = await generateKeypair();
    const recoveryKey = await generateRecoveryKey();
    const recoveryPhrase = encodeRecoveryPhrase(recoveryKey);

    const wrappedByPassphrase = await wrapPrivateKey(keypair.privateKey, masterKey);
    const wrappedByRecovery = await wrapPrivateKey(keypair.privateKey, recoveryKey);

    await api("/api/users/me/keys", {
      method: "POST",
      body: {
        publicKey: keypair.publicKey,
        kdfSalt: salt,
        kdfT: kdfLimits.t,
        kdfM: kdfLimits.m,
        kdfP: kdfLimits.p,
        wrappedPrivateKey: wrappedByPassphrase.ciphertext,
        wrappedPrivateKeyNonce: wrappedByPassphrase.nonce,
        wrappedPrivateKeyByRecovery: wrappedByRecovery.ciphertext,
        wrappedPrivateKeyByRecoveryNonce: wrappedByRecovery.nonce,
      },
    });

    setPublicKey(keypair.publicKey);
    setPrivateKey(keypair.privateKey);
    setStatus("unlocked");
    return { recoveryPhrase };
  }, []);

  const unlock = useCallback(async (passphrase: string) => {
    const keys = await api<KeysResponse>("/api/users/me/keys");
    const masterKey = await deriveMasterKey(passphrase, keys.kdfSalt, {
      t: keys.kdfT,
      m: keys.kdfM,
      p: keys.kdfP,
    });
    const unwrapped = await unwrapPrivateKey(
      { ciphertext: keys.wrappedPrivateKey, nonce: keys.wrappedPrivateKeyNonce },
      masterKey,
    );
    setPublicKey(keys.publicKey);
    setPrivateKey(unwrapped);
    setStatus("unlocked");
  }, []);

  const unlockWithRecoveryPhrase = useCallback(async (recoveryPhrase: string) => {
    const keys = await api<KeysResponse>("/api/users/me/keys");
    const recoveryKey = decodeRecoveryPhrase(recoveryPhrase);
    const unwrapped = await unwrapPrivateKey(
      { ciphertext: keys.wrappedPrivateKeyByRecovery, nonce: keys.wrappedPrivateKeyByRecoveryNonce },
      recoveryKey,
    );
    setPublicKey(keys.publicKey);
    setPrivateKey(unwrapped);
    setStatus("unlocked");
  }, []);

  const lock = useCallback(() => {
    setPrivateKey(null);
    setStatus((s) => (s === "unlocked" ? "locked" : s));
  }, []);

  const value = useMemo<CryptoSessionValue>(
    () => ({ status, publicKey, privateKey, setup, unlock, unlockWithRecoveryPhrase, lock }),
    [status, publicKey, privateKey, setup, unlock, unlockWithRecoveryPhrase, lock],
  );

  return <CryptoSessionContext.Provider value={value}>{children}</CryptoSessionContext.Provider>;
}

export function useCryptoSession(): CryptoSessionValue {
  const ctx = useContext(CryptoSessionContext);
  if (!ctx) throw new Error("useCryptoSession must be used within a CryptoSessionProvider");
  return ctx;
}
