"use client";

import { useState } from "react";
import { Loader2, Lock, ShieldPlus } from "lucide-react";
import { useCryptoSession } from "@/components/crypto-session-provider";
import { SetupFlow, UnlockFlow, UnlockedSummary } from "@/components/encryption/encryption-flows";

/**
 * Settings → Security: the same flows the inline panel uses
 * (`components/encryption`), on their own page for when someone comes
 * looking — to lock, to check their key, or to unlock ahead of time.
 */
export function SecurityManager() {
  const { status, publicKey, setup, unlock, unlockWithRecoveryPhrase, lock } = useCryptoSession();
  // Sticky once entered: `setup()` flips `status` to "unlocked" as soon as
  // the server accepts it, but the recovery-phrase steps still have to run.
  // From the current status, not false — see ProjectKeyGate: arriving here
  // by in-app navigation, "not-set-up" is already known and there's no
  // transition to catch.
  const [wizardActive, setWizardActive] = useState(status === "not-set-up");
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "not-set-up") setWizardActive(true);
  }

  return (
    <section className="flex max-w-2xl flex-col gap-5 rounded-xl border bg-card p-6 shadow-xs">
      {status === "checking" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking your encryption key…
        </p>
      ) : wizardActive ? (
        <>
          <Heading icon={ShieldPlus} title="Set up encryption" />
          <SetupFlow setup={setup} onDone={() => setWizardActive(false)} />
        </>
      ) : status === "locked" ? (
        <>
          <Heading icon={Lock} title="Unlock your key" />
          <UnlockFlow unlock={unlock} unlockWithRecoveryPhrase={unlockWithRecoveryPhrase} />
        </>
      ) : (
        <UnlockedSummary publicKey={publicKey} lock={lock} />
      )}
    </section>
  );
}

function Heading({ icon: Icon, title }: { icon: typeof Lock; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Icon className="size-3.5" />
      </span>
      {title}
    </h2>
  );
}
