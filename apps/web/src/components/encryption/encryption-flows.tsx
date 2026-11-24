"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The passphrase / recovery-phrase flows, shared by Settings → Security and
 * the inline encryption panel (`ProjectKeyGate`). One implementation so the
 * two can never drift: this is the step where a mistake costs someone their
 * data, and there is no server-side reset.
 *
 * Presentational only — the crypto lives in `CryptoSessionProvider`. These
 * render bare forms; the caller supplies the surrounding card.
 */

export const MIN_PASSPHRASE_LENGTH = 12;

type SetupStep = "passphrase" | "recovery-reveal" | "recovery-confirm";

const STEPS: { id: SetupStep; label: string }[] = [
  { id: "passphrase", label: "Passphrase" },
  { id: "recovery-reveal", label: "Recovery phrase" },
  { id: "recovery-confirm", label: "Confirm" },
];

function Steps({ current }: { current: SetupStep }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Setup progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2" aria-current={i === index ? "step" : undefined}>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full border text-[0.7rem] font-medium tabular-nums",
              i < index && "border-brand bg-brand text-brand-foreground",
              i === index && "border-brand text-brand",
              i > index && "text-muted-foreground",
            )}
          >
            {i < index ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn(i === index ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
          {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** Splits a recovery phrase into its dash-separated groups. */
function groupsOf(phrase: string): string[] {
  return phrase.split("-").filter(Boolean);
}

const normalize = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Two distinct group positions to ask for, chosen once per reveal. */
function pickGroups(count: number): [number, number] {
  if (count < 2) return [0, 0];
  const a = Math.floor(Math.random() * count);
  let b = Math.floor(Math.random() * (count - 1));
  if (b >= a) b += 1;
  return a < b ? [a, b] : [b, a];
}

export function SetupFlow({
  setup,
  onDone,
}: {
  setup: (passphrase: string) => Promise<{ recoveryPhrase: string }>;
  onDone: () => void;
}) {
  const [step, setStep] = useState<SetupStep>("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [answers, setAnswers] = useState<[string, string]>(["", ""]);
  // Asking for two groups at random positions, rather than the whole phrase,
  // is what proves it was saved: the whole phrase is still on the clipboard
  // from a second ago and can simply be pasted back. Chosen once, when the
  // phrase is created (an event, not a render).
  const [asked, setAsked] = useState<[number, number]>([0, 1]);

  const groups = useMemo(() => groupsOf(recoveryPhrase), [recoveryPhrase]);

  const tooShort = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE_LENGTH;
  const mismatch = confirmPassphrase.length > 0 && confirmPassphrase !== passphrase;

  async function createPassphrase(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length < MIN_PASSPHRASE_LENGTH || passphrase !== confirmPassphrase) return;
    setBusy(true);
    try {
      const result = await setup(passphrase);
      setRecoveryPhrase(result.recoveryPhrase);
      setAsked(pickGroups(groupsOf(result.recoveryPhrase).length));
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

  function downloadPhrase() {
    const text = [
      "EnvHQ recovery phrase",
      "",
      recoveryPhrase,
      "",
      "This unlocks your EnvHQ encryption key if you forget your passphrase.",
      "Keep it somewhere only you can reach. EnvHQ cannot recover it for you.",
      "",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "envhq-recovery-phrase.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function confirmRecovery(e: React.FormEvent) {
    e.preventDefault();
    const ok =
      groups.length > 0 &&
      normalize(answers[0]) === normalize(groups[asked[0]] ?? "") &&
      normalize(answers[1]) === normalize(groups[asked[1]] ?? "");
    if (!ok) {
      toast.error("Those don't match your recovery phrase. Check the copy you saved.");
      return;
    }
    toast.success("Encryption is set up");
    onDone();
  }

  return (
    <div className="flex flex-col gap-5">
      <Steps current={step} />

      {step === "passphrase" && (
        <form onSubmit={createPassphrase} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Your values are encrypted in this browser with a key only you can unlock. EnvHQ stores
            ciphertext and never sees the passphrase.
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="setup-passphrase">Passphrase</Label>
            <Input
              id="setup-passphrase"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              aria-invalid={tooShort || undefined}
              aria-describedby="setup-passphrase-hint"
            />
            <p id="setup-passphrase-hint" className={cn("text-xs", tooShort ? "text-destructive" : "text-muted-foreground")}>
              At least {MIN_PASSPHRASE_LENGTH} characters. A password manager is the right place for it.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="setup-confirm">Confirm passphrase</Label>
            <Input
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              aria-invalid={mismatch || undefined}
            />
            {mismatch && <p className="text-xs text-destructive">Doesn&rsquo;t match yet.</p>}
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={busy || passphrase.length < MIN_PASSPHRASE_LENGTH || passphrase !== confirmPassphrase}
            >
              {busy ? "Creating your key…" : "Continue"}
            </Button>
          </div>
        </form>
      )}

      {step === "recovery-reveal" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            If you forget your passphrase, this phrase is the only other way in. It&rsquo;s shown
            once. Lose both and nobody, including EnvHQ, can recover your data.
          </p>
          <code className="block rounded-lg border bg-muted/50 px-4 py-3 font-mono text-sm leading-relaxed tracking-wide break-all">
            {recoveryPhrase}
          </code>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyPhrase}>
                {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={downloadPhrase}>
                <Download className="size-3.5" /> Download .txt
              </Button>
            </div>
            <Button onClick={() => setStep("recovery-confirm")}>I&rsquo;ve saved it</Button>
          </div>
        </div>
      )}

      {step === "recovery-confirm" && (
        <form onSubmit={confirmRecovery} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            From the copy you saved, enter these two groups.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {asked.map((pos, i) => (
              <div key={pos} className="grid gap-1.5">
                <Label htmlFor={`recovery-group-${i}`}>Group {pos + 1}</Label>
                <Input
                  id={`recovery-group-${i}`}
                  autoFocus={i === 0}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono uppercase"
                  value={answers[i]}
                  onChange={(e) =>
                    setAnswers((prev) => (i === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("recovery-reveal")}>
              Show the phrase again
            </Button>
            <Button type="submit" disabled={!answers[0].trim() || !answers[1].trim()}>
              Finish setup
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function UnlockFlow({
  unlock,
  unlockWithRecoveryPhrase,
}: {
  unlock: (passphrase: string) => Promise<void>;
  unlockWithRecoveryPhrase: (recoveryPhrase: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"passphrase" | "recovery">("passphrase");
  const [passphrase, setPassphrase] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);
    try {
      if (mode === "passphrase") await unlock(passphrase);
      else await unlockWithRecoveryPhrase(recoveryPhrase);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {mode === "passphrase" ? (
        <div className="grid gap-1.5">
          <Label htmlFor="unlock-passphrase">Passphrase</Label>
          <div className="flex gap-2">
            <Input
              id="unlock-passphrase"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                setFailed(false);
              }}
              aria-invalid={failed || undefined}
            />
            <Button type="submit" disabled={busy || !passphrase}>
              <Lock className="size-3.5" /> {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="unlock-recovery">Recovery phrase</Label>
          <Textarea
            id="unlock-recovery"
            autoFocus
            spellCheck={false}
            className="font-mono"
            value={recoveryPhrase}
            onChange={(e) => {
              setRecoveryPhrase(e.target.value);
              setFailed(false);
            }}
            placeholder="XXXXX-XXXXX-XXXXX-…"
            aria-invalid={failed || undefined}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !recoveryPhrase.trim()}>
              <KeyRound className="size-3.5" /> {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={failed ? "text-destructive" : "text-muted-foreground"}>
          {failed
            ? mode === "passphrase"
              ? "That passphrase didn't unlock your key."
              : "That recovery phrase didn't unlock your key."
            : "Stays unlocked until you reload or close this tab."}
        </span>
        <button
          type="button"
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => {
            setMode(mode === "passphrase" ? "recovery" : "passphrase");
            setFailed(false);
          }}
        >
          {mode === "passphrase" ? "Use recovery phrase" : "Use passphrase"}
        </button>
      </div>
    </form>
  );
}

/** A short, comparable fingerprint of a public key: the first 16 base64 characters in groups of four. */
export function keyFingerprint(publicKey: string | null): string {
  if (!publicKey) return "—";
  return (publicKey.replace(/[^A-Za-z0-9]/g, "").slice(0, 16).match(/.{1,4}/g) ?? []).join(" ");
}

export function UnlockedSummary({ publicKey, lock }: { publicKey: string | null; lock: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand/10 text-brand">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Unlocked in this tab</p>
          <p className="text-xs text-muted-foreground">
            Key fingerprint <span className="font-mono text-foreground">{keyFingerprint(publicKey)}</span>
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={lock}>
        <Lock className="size-3.5" /> Lock now
      </Button>
    </div>
  );
}
