"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Lock, ShieldAlert, ShieldPlus } from "lucide-react";
import { generateDek, sealToPublicKey, encodeBase64 } from "@envhq/crypto";
import { Button } from "@/components/ui/button";
import { useCryptoSession } from "@/components/crypto-session-provider";
import { useProjectDek } from "@/hooks/use-project-dek";
import { api } from "@/lib/client";
import { SetupFlow, UnlockFlow } from "./encryption-flows";

/**
 * Everything between "you're signed in" and "here is this project's key",
 * handled where the person already is — never as a trip to Settings.
 *
 *   - no encryption key yet  → set it up right here (passphrase, recovery)
 *   - locked (every reload)  → a passphrase field on this card
 *   - project has no key yet → created automatically, no card
 *   - someone else holds it  → explain who has to act
 *
 * Children render only once the project's DEK is in hand.
 *
 * The first-key auto-create is safe because "nobody holds a key" means the
 * project is provably empty (`env_vars` can't hold a value without a DEK to
 * encrypt under), and the server refuses a self-registered key once anyone
 * holds one — so two people opening a new project at the same moment can't
 * end up on different keys (`api/projects/[id]/keys`).
 */
export function ProjectKeyGate({
  projectId,
  purpose,
  children,
}: {
  projectId: string;
  /** Finishes "Unlock to …" / "Set up encryption to …". */
  purpose: string;
  children: (dek: Uint8Array) => React.ReactNode;
}) {
  const session = useCryptoSession();
  const { status, dek, refetch } = useProjectDek(projectId);

  // Setup flips the session to "unlocked" as soon as the key is stored, but
  // the recovery-phrase steps still have to run. Hold the wizard open until
  // it says it's done.
  // Starts from the current status, not false: when the session already knew
  // there was no key (it's loaded once for the whole app), there's no
  // transition to catch, and the recovery-phrase steps would be skipped the
  // moment setup() unlocked the session. That's the one screen that must
  // never be skipped.
  const [wizard, setWizard] = useState(session.status === "not-set-up");
  const [prevSession, setPrevSession] = useState(session.status);
  if (session.status !== prevSession) {
    setPrevSession(session.status);
    if (session.status === "not-set-up") setWizard(true);
  }

  const autoInit = useAutoInitProjectKey(projectId, status === "uninitialized" && !wizard, refetch);

  if (session.status === "checking" || (status === "checking" && !wizard)) {
    return <GateShell icon={Loader2} spin title="Checking your encryption key…" />;
  }

  if (wizard || session.status === "not-set-up") {
    return (
      <GateShell
        icon={ShieldPlus}
        title="Set up encryption"
        description={`One time, about a minute. You need it ${purpose}.`}
      >
        <SetupFlow setup={session.setup} onDone={() => setWizard(false)} />
      </GateShell>
    );
  }

  if (status === "locked") {
    return (
      <GateShell icon={Lock} title={`Unlock ${purpose}`} description="Values are decrypted in this browser with your key.">
        <UnlockFlow unlock={session.unlock} unlockWithRecoveryPhrase={session.unlockWithRecoveryPhrase} />
      </GateShell>
    );
  }

  if (status === "uninitialized") {
    if (autoInit.failed) {
      return (
        <GateShell
          icon={ShieldAlert}
          title="Couldn't create this project's key"
          description="The project is empty, so nothing is at risk. Try again."
        >
          <div>
            <Button onClick={autoInit.retry}>Try again</Button>
          </div>
        </GateShell>
      );
    }
    return <GateShell icon={Loader2} spin title="Creating this project's encryption key…" />;
  }

  if (status === "no-key") {
    return (
      <GateShell
        icon={KeyRound}
        title="Waiting for a copy of this project's key"
        description="You have access, but your copy of the encryption key hasn't been shared yet. It's shared automatically the next time a teammate who already has it opens this project. Ask one of them to open it."
      />
    );
  }

  if (status === "error" || !dek) {
    return (
      <GateShell
        icon={ShieldAlert}
        title="Couldn't load this project's key"
        description="Something went wrong fetching or unsealing it. Reload the page to try again."
      />
    );
  }

  return <>{children(dek)}</>;
}

/**
 * Generates and registers a project's first DEK when nobody holds one yet.
 * Runs once per `active` period. A 409 means someone else's first key landed
 * first — refetching then finds theirs (or a pending share), which is the
 * right outcome, not an error.
 */
function useAutoInitProjectKey(projectId: string, active: boolean, refetch: () => void) {
  const { publicKey } = useCryptoSession();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<string | null>(null);

  useEffect(() => {
    const token = `${projectId}:${attempt}`;
    if (!active || !publicKey || started.current === token) return;
    started.current = token;
    void (async () => {
      try {
        const dek = await generateDek();
        const wrappedDek = await sealToPublicKey(encodeBase64(dek), publicKey);
        await api(`/api/projects/${projectId}/keys`, { method: "POST", body: { wrappedDek } }).catch((err) => {
          if ((err as { status?: number }).status !== 409) throw err;
        });
        refetch();
      } catch {
        setFailed(true);
      }
    })();
  }, [active, publicKey, projectId, attempt, refetch]);

  return {
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((a) => a + 1);
    },
  };
}

function GateShell({
  icon: Icon,
  spin,
  title,
  description,
  children,
}: {
  icon: typeof Lock;
  spin?: boolean;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-5 rounded-xl border bg-card p-6 shadow-xs">
      <header className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Icon className={spin ? "size-4 animate-spin" : "size-4"} />
        </span>
        <div className="flex min-w-0 flex-col gap-1 pt-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
