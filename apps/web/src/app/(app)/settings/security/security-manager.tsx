"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Lock, Copy, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useCryptoSession } from "@/components/crypto-session-provider";

type SetupStep = "intro" | "passphrase" | "recovery-reveal" | "recovery-confirm";
type UnlockMode = "passphrase" | "recovery";

const MIN_PASSPHRASE_LENGTH = 12;

export function SecurityManager() {
  const { status, publicKey, setup, unlock, unlockWithRecoveryPhrase, lock } = useCryptoSession();
  // Sticky once entered: `setup()` flips `status` to "unlocked" as soon as
  // the server accepts it, but the wizard still has a recovery-phrase
  // reveal + confirm step to run — without this, the parent would swap to
  // <UnlockedCard> the instant setup() resolves and the user would never
  // see their recovery phrase. Adjusted during render (React's documented
  // pattern for state that reacts to a prop/value change) rather than in an
  // effect, since it only needs to run once per status transition.
  const [wizardActive, setWizardActive] = useState(false);
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "not-set-up") setWizardActive(true);
  }

  if (status === "checking") {
    return <p className="text-sm text-muted-foreground">Checking your encryption status…</p>;
  }
  if (wizardActive) {
    return <SetupFlow setup={setup} onDone={() => setWizardActive(false)} />;
  }
  if (status === "locked") {
    return <UnlockFlow unlock={unlock} unlockWithRecoveryPhrase={unlockWithRecoveryPhrase} />;
  }
  return <UnlockedCard publicKey={publicKey} lock={lock} />;
}

function SetupFlow({
  setup,
  onDone,
}: {
  setup: (passphrase: string) => Promise<{ recoveryPhrase: string }>;
  onDone: () => void;
}) {
  const [step, setStep] = useState<SetupStep>("intro");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [confirmRecoveryPhrase, setConfirmRecoveryPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createPassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      toast.error(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
      return;
    }
    if (passphrase !== confirmPassphrase) {
      toast.error("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await setup(passphrase);
      setRecoveryPhrase(result.recoveryPhrase);
      setStep("recovery-reveal");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyPhrase() {
    await navigator.clipboard.writeText(recoveryPhrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function confirmRecovery(e: React.FormEvent) {
    e.preventDefault();
    const normalize = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "");
    // Explicit non-empty check, not just relying on the submit button's
    // `disabled` state — a disabled attribute on a non-native-rendered
    // button (this design system's Button can lose native semantics
    // depending on how it's composed) isn't a reliable enough gate for a
    // step this security-sensitive.
    if (!normalize(confirmRecoveryPhrase) || normalize(confirmRecoveryPhrase) !== normalize(recoveryPhrase)) {
      toast.error("That doesn't match your recovery phrase.");
      return;
    }
    toast.success("End-to-end encryption enabled");
    onDone();
  }

  if (step === "intro") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-brand" /> Enable end-to-end encryption
          </CardTitle>
          <CardDescription>
            Sets up a passphrase-protected key so your env values are encrypted in your browser
            before they ever leave your device — EnvHQ&apos;s servers only ever store ciphertext.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            You&apos;ll choose a passphrase and get a one-time recovery phrase. Losing{" "}
            <strong className="text-foreground">both</strong> means losing access to encrypted
            data — there is no server-side reset.
          </p>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => setStep("passphrase")}>Get started</Button>
        </CardFooter>
      </Card>
    );
  }

  if (step === "passphrase") {
    return (
      <Card>
        <form onSubmit={createPassphrase}>
          <CardHeader>
            <CardTitle>Choose a passphrase</CardTitle>
            <CardDescription>
              At least {MIN_PASSPHRASE_LENGTH} characters. Use a password manager — this can&apos;t
              be reset if you forget it and lose your recovery phrase.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                autoFocus
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-passphrase">Confirm passphrase</Label>
              <Input
                id="confirm-passphrase"
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={busy || !passphrase || !confirmPassphrase}>
              {busy ? "Setting up…" : "Continue"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  if (step === "recovery-reveal") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Save your recovery phrase</CardTitle>
          <CardDescription>
            This is the only other way to unlock your data if you forget your passphrase. Store it
            somewhere safe — it&apos;s shown only once.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-sm">
              {recoveryPhrase}
            </code>
            <Button size="icon" variant="outline" type="button" onClick={copyPhrase}>
              {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => setStep("recovery-confirm")}>I&apos;ve saved it</Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={confirmRecovery}>
        <CardHeader>
          <CardTitle>Confirm your recovery phrase</CardTitle>
          <CardDescription>Type it back exactly to prove you saved it correctly.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            autoFocus
            value={confirmRecoveryPhrase}
            onChange={(e) => setConfirmRecoveryPhrase(e.target.value)}
            placeholder="XXXXX-XXXXX-XXXXX-…"
          />
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!confirmRecoveryPhrase}>
            Finish setup
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function UnlockFlow({
  unlock,
  unlockWithRecoveryPhrase,
}: {
  unlock: (passphrase: string) => Promise<void>;
  unlockWithRecoveryPhrase: (recoveryPhrase: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<UnlockMode>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitPassphrase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await unlock(passphrase);
      toast.success("Unlocked");
    } catch {
      toast.error("Wrong passphrase.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await unlockWithRecoveryPhrase(recoveryPhrase);
      toast.success("Unlocked with recovery phrase");
    } catch {
      toast.error("That recovery phrase didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {mode === "passphrase" ? (
        <form onSubmit={submitPassphrase}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-4" /> Unlock encryption
            </CardTitle>
            <CardDescription>Enter your passphrase to decrypt values in this session.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="unlock-passphrase">Passphrase</Label>
            <Input
              id="unlock-passphrase"
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="button" variant="link" className="px-0" onClick={() => setMode("recovery")}>
              Use recovery phrase instead
            </Button>
            <Button type="submit" disabled={busy || !passphrase}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={submitRecovery}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> Unlock with recovery phrase
            </CardTitle>
            <CardDescription>Paste the phrase you saved when you set up encryption.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              autoFocus
              value={recoveryPhrase}
              onChange={(e) => setRecoveryPhrase(e.target.value)}
              placeholder="XXXXX-XXXXX-XXXXX-…"
            />
          </CardContent>
          <CardFooter className="justify-between">
            <Button type="button" variant="link" className="px-0" onClick={() => setMode("passphrase")}>
              Use passphrase instead
            </Button>
            <Button type="submit" disabled={busy || !recoveryPhrase}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

function UnlockedCard({ publicKey, lock }: { publicKey: string | null; lock: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-brand" /> Encryption unlocked
        </CardTitle>
        <CardDescription>Your key is active for this browser session.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-1">
          <Label className="text-xs text-muted-foreground">Public key</Label>
          <code className="break-all rounded bg-muted px-3 py-2 font-mono text-xs">
            {publicKey ?? "—"}
          </code>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={lock}>
          <Lock className="size-4" /> Lock
        </Button>
      </CardFooter>
    </Card>
  );
}
