"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Pencil,
  Plus,
  ClipboardPaste,
  Download,
  Search,
  AlertTriangle,
  Lock,
  KeyRound,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { parseEnv, serializeEnv } from "@envhq/parser";
import { encryptValue, decryptValue, generateDek, sealToPublicKey, encodeBase64 } from "@envhq/crypto";
import { api } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import { isProdEnv } from "@/components/project-visuals";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useCryptoSession } from "@/components/crypto-session-provider";
import { useProjectDek } from "@/hooks/use-project-dek";
import { useProjectKeyReconciliation } from "@/hooks/use-project-key-reconciliation";

/** A row as the server returns it — ciphertext only; decrypted client-side. */
interface Row {
  id: string;
  key: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
}

async function encryptField(dek: Uint8Array, value: string) {
  const { ciphertext, nonce } = await encryptValue(dek, value);
  return { ciphertext, iv: nonce };
}

function decryptRow(dek: Uint8Array, row: Row): Promise<string> {
  return decryptValue(dek, { ciphertext: row.ciphertext, nonce: row.iv });
}

export function EnvEditor({
  environmentId,
  projectId,
  initialVars,
  envName,
}: {
  environmentId: string;
  projectId: string;
  initialVars: Row[];
  envName: string;
}) {
  const { publicKey } = useCryptoSession();
  const { status: dekStatus, dek, refetch } = useProjectDek(projectId);

  if (dekStatus === "checking") {
    return <p className="text-sm text-muted-foreground">Checking your encryption status…</p>;
  }
  if (dekStatus === "locked") {
    return (
      <GateCard
        icon={Lock}
        title="Unlock encryption to view this environment"
        description="Your values are end-to-end encrypted. Unlock with your passphrase to view or edit them in this browser session."
        href="/settings/security"
        cta="Go to Security settings"
      />
    );
  }
  if (dekStatus === "uninitialized") {
    return <UninitializeCard projectId={projectId} publicKey={publicKey} onDone={refetch} />;
  }
  if (dekStatus === "no-key") {
    return (
      <GateCard
        icon={KeyRound}
        title="Waiting for access to this project's key"
        description="You're authorized for this project, but no one has shared its encryption key with you yet. Ask an admin to open this project so it can be granted to you."
      />
    );
  }
  if (dekStatus === "error" || !dek) {
    return (
      <GateCard
        icon={ShieldAlert}
        title="Couldn't load this project's encryption key"
        description="Something went wrong fetching or unlocking this project's key. Try reloading the page."
      />
    );
  }

  return (
    <EnvEditorReady
      environmentId={environmentId}
      projectId={projectId}
      initialVars={initialVars}
      envName={envName}
      dek={dek}
    />
  );
}

function GateCard({
  icon: Icon,
  title,
  description,
  href,
  cta,
}: {
  icon: typeof Lock;
  title: string;
  description: string;
  href?: string;
  cta?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-brand" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {href && cta ? (
        <div className="px-(--card-spacing) pb-(--card-spacing)">
          <Button render={<a href={href} />}>{cta}</Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A project with zero `project_keys` rows for *anyone* — its creator's
 * session wasn't unlocked at creation time (create-project-dialog's DEK
 * registration is best-effort). Since `env_vars` can't hold anything
 * without a DEK to encrypt under, this state provably means the project is
 * still empty, so any authorized, unlocked visitor can safely generate the
 * first DEK themselves rather than waiting on reconciliation, which has
 * nothing to redistribute yet.
 */
function UninitializeCard({
  projectId,
  publicKey,
  onDone,
}: {
  projectId: string;
  publicKey: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const dek = await generateDek();
      const wrappedDek = await sealToPublicKey(encodeBase64(dek), publicKey);
      await api(`/api/projects/${projectId}/keys`, { method: "POST", body: { wrappedDek } });
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" /> This project doesn&apos;t have an encryption key yet
        </CardTitle>
        <CardDescription>
          It looks like this project was created before encryption was set up. Generate its key now
          to start adding values — this only needs to happen once.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate encryption key"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function EnvEditorReady({
  environmentId,
  projectId,
  initialVars,
  envName,
  dek,
}: {
  environmentId: string;
  projectId: string;
  initialVars: Row[];
  envName: string;
  dek: Uint8Array;
}) {
  const router = useRouter();
  useProjectKeyReconciliation(projectId, dek);
  const [vars, setVars] = useState<Row[]>(initialVars);
  // Resync when the server component re-renders with fresh vars (e.g. after
  // a version rollback triggers router.refresh() from a sibling component) —
  // useState's initial value only applies on mount, so without this the
  // table would keep showing stale data after an out-of-band refresh.
  // Adjusted during render (React's documented pattern for state that
  // reacts to a prop change) rather than in an effect.
  const [prevInitialVars, setPrevInitialVars] = useState(initialVars);
  if (initialVars !== prevInitialVars) {
    setPrevInitialVars(initialVars);
    setVars(initialVars);
  }

  // Decrypted once the DEK is ready — masking below is a UI convenience
  // only (same as before: the server used to send plaintext for every row
  // regardless of reveal state), not a real security boundary, since the
  // DEK is already in memory either way.
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      vars.map(async (v) => {
        try {
          return [v.id, await decryptRow(dek, v)] as const;
        } catch {
          return [v.id, "(couldn't decrypt)"] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setDecrypted(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [vars, dek]);

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealAll, setRevealAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deleteEnvOpen, setDeleteEnvOpen] = useState(false);
  const isProd = isProdEnv(envName);
  const filtered = query
    ? vars.filter((v) => v.key.toLowerCase().includes(query.toLowerCase()))
    : vars;

  async function reload() {
    const data = await api<{ vars: Row[] }>(`/api/environments/${environmentId}`);
    setVars(data.vars);
  }

  async function deleteEnvironment() {
    await api(`/api/environments/${environmentId}`, { method: "DELETE" });
    toast.success(`Deleted "${envName}"`);
    router.push(`/projects/${projectId}`);
  }

  function isRevealed(id: string) {
    return revealAll || revealed.has(id);
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  }

  async function copyAll() {
    try {
      const data = await api<{ pairs: { key: string; ciphertext: string; iv: string }[]; count: number }>(
        `/api/environments/${environmentId}/export`,
      );
      if (data.pairs.length === 0) {
        toast.info("Nothing to copy — this environment is empty");
        return;
      }
      const pairs = await Promise.all(
        data.pairs.map(async (p) => ({
          key: p.key,
          value: await decryptValue(dek, { ciphertext: p.ciphertext, nonce: p.iv }),
        })),
      );
      await navigator.clipboard.writeText(serializeEnv(pairs));
      toast.success(`Copied ${data.count} variable${data.count === 1 ? "" : "s"} as .env`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {isProd && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          Editing <code>{envName}</code> — changes take effect immediately.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keys"
            className="w-full pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setRevealAll((v) => !v)}>
          {revealAll ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {revealAll ? "Hide all" : "Reveal all"}
        </Button>
        <Button variant="outline" size="sm" onClick={copyAll}>
          <Download className="size-4" /> Copy all as .env
        </Button>
        <PasteDialog environmentId={environmentId} dek={dek} onDone={reload} />
        <Button variant="destructive" size="sm" onClick={() => setDeleteEnvOpen(true)}>
          <Trash2 className="size-4" /> Delete environment
        </Button>
      </div>

      <ConfirmDeleteDialog
        open={deleteEnvOpen}
        onOpenChange={setDeleteEnvOpen}
        title={`Delete environment "${envName}"`}
        description={
          <>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">
              {vars.length} variable{vars.length === 1 ? "" : "s"}
            </span>
            . This can&rsquo;t be undone.
          </>
        }
        confirmationText={isProd ? envName : undefined}
        onConfirm={deleteEnvironment}
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%]">Key</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="w-[160px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AddRow environmentId={environmentId} dek={dek} onAdded={reload} />
            {vars.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No variables yet. Add one above or paste a .env.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No keys match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <VarRow
                  key={row.id}
                  row={row}
                  value={decrypted[row.id] ?? ""}
                  dek={dek}
                  revealed={isRevealed(row.id)}
                  copied={copiedId === row.id}
                  onToggleReveal={() => toggleReveal(row.id)}
                  onCopy={() => copy(decrypted[row.id] ?? "", row.id)}
                  onChanged={reload}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Environment <code>{envName}</code> · values are end-to-end encrypted — EnvHQ cannot read them.
      </p>
    </div>
  );
}

function VarRow({
  row,
  value,
  dek,
  revealed,
  copied,
  onToggleReveal,
  onCopy,
  onChanged,
}: {
  row: Row;
  value: string;
  dek: Uint8Array;
  revealed: boolean;
  copied: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState(row.key);
  const [editValue, setEditValue] = useState(value);
  const [busy, setBusy] = useState(false);

  // `value` starts as "" (decryption is still in flight when this row first
  // mounts) and arrives shortly after — pick it up once it does. Adjusted
  // during render rather than in an effect, same reasoning as the parent's
  // `initialVars` resync above.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setEditValue(value);
  }

  async function save() {
    setBusy(true);
    try {
      const encrypted = await encryptField(dek, editValue);
      await api(`/api/vars/${row.id}`, {
        method: "PATCH",
        body: { key: key.trim(), ...encrypted },
      });
      toast.success("Saved");
      setEditing(false);
      await onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${row.key}"?`)) return;
    try {
      await api(`/api/vars/${row.id}`, { method: "DELETE" });
      toast.success(`Deleted "${row.key}"`);
      await onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (editing) {
    return (
      <TableRow>
        <TableCell className="align-top">
          <Input value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
        </TableCell>
        <TableCell className="align-top">
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="min-h-9 field-sizing-content resize-y font-mono text-sm"
          />
        </TableCell>
        <TableCell className="text-right align-top">
          <div className="flex justify-end gap-1">
            <Button size="sm" onClick={save} disabled={busy || !key.trim()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setKey(row.key);
                setEditValue(value);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="align-top">
        <span className="block font-mono font-medium break-all">{row.key}</span>
        <span className="block text-xs text-muted-foreground">
          updated {formatRelativeTime(row.updatedAt)}
        </span>
      </TableCell>
      <TableCell className="font-mono text-muted-foreground align-top">
        <span className="block max-w-xl whitespace-pre-wrap break-all">
          {revealed ? value || <em className="not-italic opacity-50">(empty)</em> : "••••••••••••"}
        </span>
      </TableCell>
      <TableCell className="text-right align-top">
        <div className="flex justify-end gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={onToggleReveal}>
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={onCopy}>
            {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={remove}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AddRow({
  environmentId,
  dek,
  onAdded,
}: {
  environmentId: string;
  dek: Uint8Array;
  onAdded: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!key.trim()) return;
    setBusy(true);
    try {
      const encrypted = await encryptField(dek, value);
      await api(`/api/environments/${environmentId}/vars`, {
        method: "POST",
        body: { key: key.trim(), ...encrypted },
      });
      setKey("");
      setValue("");
      await onAdded();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="align-top">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="NEW_KEY"
          className="font-mono"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </TableCell>
      <TableCell className="align-top">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="value (multi-line ok)"
          className="min-h-9 field-sizing-content resize-y font-mono text-sm"
        />
      </TableCell>
      <TableCell className="text-right align-top">
        <Button size="sm" onClick={add} disabled={busy || !key.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </TableCell>
    </TableRow>
  );
}

function PasteDialog({
  environmentId,
  dek,
  onDone,
}: {
  environmentId: string;
  dek: Uint8Array;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const parsed = parseEnv(content);
      if (parsed.length === 0) {
        toast.error("No valid KEY=value lines found in the pasted content");
        return;
      }
      const pairs = await Promise.all(
        parsed.map(async (p) => ({ key: p.key, ...(await encryptField(dek, p.value)) })),
      );
      const res = await api<{ created: number; updated: number; total: number }>(
        `/api/environments/${environmentId}/import`,
        { method: "POST", body: { pairs } },
      );
      toast.success(`Imported ${res.total}: ${res.created} new, ${res.updated} updated`);
      setContent("");
      setOpen(false);
      await onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <ClipboardPaste className="size-4" /> Paste .env
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste .env</DialogTitle>
          <DialogDescription>
            Paste a whole <code>.env</code> file. Existing keys are updated, new keys added
            (merge). Comments and quotes are handled.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="paste" className="sr-only">
          Env content
        </Label>
        <Textarea
          id="paste"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"DATABASE_URL=postgres://…\nAPI_KEY=sk-…\n# comments ok"}
          className="min-h-56 font-mono text-sm"
          autoFocus
        />
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !content.trim()}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
