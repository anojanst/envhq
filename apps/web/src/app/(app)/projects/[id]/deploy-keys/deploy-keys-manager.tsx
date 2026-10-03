"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Lock, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { api } from "@/lib/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { issueDeployKey } from "@/lib/deploy-key-client";
import { useProjectDek } from "@/hooks/use-project-dek";

export interface DeployKeyRow {
  id: string;
  label: string;
  environmentId: string | null;
  environmentName: string | null;
  publicKey: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface Issued {
  deployKeySecret: string;
  token: string;
}

export function DeployKeysManager({
  projectId,
  initialKeys,
  environments,
}: {
  projectId: string;
  initialKeys: DeployKeyRow[];
  environments: { id: string; name: string }[];
}) {
  const { status: dekStatus, dek } = useProjectDek(projectId);
  const [keys, setKeys] = useState(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [copied, setCopied] = useState<"key" | "token" | null>(null);
  const [revoking, setRevoking] = useState<DeployKeyRow | null>(null);

  async function reload() {
    const data = await api<{ deployKeys: DeployKeyRow[] }>(`/api/projects/${projectId}/deploy-keys`);
    // The API returns creator ids; the page resolved them to names on the
    // server. Keep the names we already have rather than showing raw ids
    // after a reload.
    const byId = new Map(keys.map((k) => [k.id, k.createdBy]));
    setKeys(data.deployKeys.map((k) => ({ ...k, createdBy: byId.get(k.id) ?? k.createdBy })));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!dek) return;
    setBusy(true);
    try {
      const result = await issueDeployKey({
        projectId,
        label: label.trim(),
        environmentId: environmentId || null,
        dek,
      });
      setIssued({ deployKeySecret: result.deployKeySecret, token: result.token });
      setSavedConfirmed(false);
      setLabel("");
      setEnvironmentId("");
      setCreateOpen(false);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(what: "key" | "token", text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
  }

  async function revoke(row: DeployKeyRow) {
    await api(`/api/projects/${projectId}/deploy-keys/${row.id}`, { method: "DELETE" });
    toast.success(`Revoked "${row.label}"`);
    await reload();
  }

  if (dekStatus === "locked") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-brand" /> Unlock encryption to issue a deploy key
          </CardTitle>
          <CardDescription>
            Issuing a key means sealing this project&rsquo;s encryption key to it, which happens in
            your browser. Unlock with your passphrase first.
          </CardDescription>
        </CardHeader>
        <div className="px-(--card-spacing) pb-(--card-spacing)">
          <Button render={<a href="/settings/security" />}>Go to Security settings</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button disabled={!dek} />}>
            <Plus className="size-4" /> New deploy key
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>New deploy key</DialogTitle>
                <DialogDescription>
                  Generated in this browser. The private half is shown once and cannot be recovered.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="dk-label">What is it for?</Label>
                  <Input
                    id="dk-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="GitHub Actions — deploy"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    A key nobody can attribute is a key nobody dares to revoke.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="dk-env">Restrict to an environment</Label>
                  <select
                    id="dk-env"
                    className="h-9 rounded-md border bg-transparent px-3 text-sm"
                    value={environmentId}
                    onChange={(e) => setEnvironmentId(e.target.value)}
                  >
                    <option value="">No restriction — the whole project</option>
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name}
                      </option>
                    ))}
                  </select>
                  {/* ADR-020 is explicit that calling this "scoped" without
                      qualification tells customers they have an isolation
                      guarantee they do not have. */}
                  <p className="text-xs text-muted-foreground">
                    This limits what the API will serve to this key. It is{" "}
                    <strong className="font-medium text-foreground">not</strong> a cryptographic
                    boundary: encryption keys are per project, so this key mathematically opens
                    every environment in it. Use it as defence in depth, not as isolation you would
                    bet production on.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy || !label.trim() || !dek}>
                  {busy ? "Generating…" : "Generate key"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/*
        Show-once, with a confirm step — the same contract the recovery
        phrase uses. Closing is gated on the confirmation because these two
        values cannot be recovered: there is no support path, by design.
      */}
      <Dialog
        open={!!issued}
        onOpenChange={(open) => {
          if (!open && savedConfirmed) setIssued(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save both secrets now</DialogTitle>
            <DialogDescription>
              This is the only time either is shown. EnvHQ cannot show them again or recover them —
              if you lose them, issue a new key.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">
                <code>ENVHQ_DEPLOY_KEY</code> — decrypts the values
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs">
                  {issued?.deployKeySecret}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copy deploy key"
                  onClick={() => issued && copy("key", issued.deployKeySecret)}
                >
                  {copied === "key" ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">
                <code>ENVHQ_TOKEN</code> — fetches the ciphertext
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs">
                  {issued?.token}
                </code>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copy token"
                  onClick={() => issued && copy("token", issued.token)}
                >
                  {copied === "token" ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              A pipeline needs both. The token alone fetches ciphertext and variable names but
              decrypts nothing; the key alone has nothing to decrypt.{" "}
              {/* A new tab: navigating here would close this show-once dialog before the secrets are saved. */}
              <a href="/docs/ci" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                Use them in GitHub Actions or another CI
              </a>
              .
            </p>

            <label className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={savedConfirmed}
                onChange={(e) => setSavedConfirmed(e.target.checked)}
              />
              <span>I&rsquo;ve stored both as CI secrets. I understand they can&rsquo;t be shown again.</span>
            </label>
          </div>

          <DialogFooter>
            <Button disabled={!savedConfirmed} onClick={() => setIssued(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke "${revoking?.label ?? ""}"`}
        description={
          <div className="flex flex-col gap-2">
            <p>
              This drops the key&rsquo;s access and deletes its API token immediately. Any pipeline
              using it will stop working.
            </p>
            {/* ADR-020: "Step 4 is the one customers will skip. The
                revocation UI should say it." */}
            <p className="font-medium text-foreground">Revoking is not enough on its own.</p>
            <p>
              It stops future fetches, but it cannot un-learn an encryption key the holder already
              has. If this key may have leaked, you must also{" "}
              <strong className="font-medium text-foreground">rotate this project&rsquo;s key</strong>{" "}
              (on Manage access) and then{" "}
              <strong className="font-medium text-foreground">
                rotate the underlying credentials themselves
              </strong>{" "}
              — the database passwords, the API keys. EnvHQ can re-encrypt a value; it cannot make
              an attacker forget one they already read.
            </p>
          </div>
        }
        onConfirm={async () => {
          if (revoking) await revoke(revoking);
        }}
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <KeyRound className="mx-auto mb-2 size-6" />
                  No deploy keys yet. Create one to let a pipeline decrypt this project.
                </TableCell>
              </TableRow>
            ) : (
              keys.map((k) => (
                <TableRow key={k.id} className={cn(k.revokedAt && "opacity-50")}>
                  <TableCell className="font-medium">
                    {k.label}
                    {k.revokedAt && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-destructive">
                        <ShieldAlert className="size-3" /> revoked
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">by {k.createdBy}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.environmentName ?? "Whole project"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(k.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {k.lastUsedAt ? formatRelativeTime(k.lastUsedAt) : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    {k.revokedAt ? (
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(k.revokedAt)}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Revoke ${k.label}`}
                        onClick={() => setRevoking(k)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
