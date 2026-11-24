"use client";

import { useState, useEffect, useCallback, memo } from "react";
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
  Search,
  AlertTriangle,
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
import { parseEnv, serializeEnv } from "@envhq/parser";
import { encryptValue, decryptValue } from "@envhq/crypto";
import { api } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import { isProdEnv } from "@/components/project-visuals";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ProjectKeyGate } from "@/components/encryption/project-key-gate";
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

/**
 * Plaintext for the named rows. Pure — it touches no state, so both the
 * on-demand path and the post-reload refill can share it without either
 * having to reach into the other's closure.
 *
 * A row that won't decrypt yields a placeholder rather than throwing: one
 * bad row (ciphertext written under a DEK generation this client no longer
 * holds) shouldn't blank the rest of the table.
 */
async function decryptRows(dek: Uint8Array, rows: Row[], ids: string[]): Promise<Record<string, string>> {
  const wanted = new Set(ids);
  const entries = await Promise.all(
    rows
      .filter((r) => wanted.has(r.id))
      .map(async (r) => {
        try {
          return [r.id, await decryptRow(dek, r)] as const;
        } catch {
          return [r.id, "(couldn't decrypt)"] as const;
        }
      }),
  );
  return Object.fromEntries(entries);
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
  return (
    <ProjectKeyGate projectId={projectId} purpose="to see and edit these values">
      {(dek) => (
        <EnvEditorReady
          environmentId={environmentId}
          projectId={projectId}
          initialVars={initialVars}
          envName={envName}
          dek={dek}
        />
      )}
    </ProjectKeyGate>
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

  /**
   * Plaintext for the rows that have actually been asked for (RM-9).
   *
   * This used to decrypt every row on mount, in one `Promise.all`. The cost
   * was never the crypto — 500 values decrypt in 3.4ms — it was what
   * happened afterwards: the result landed on every row at once and
   * re-rendered the whole table, 105ms of work updating text that is masked
   * and so not on screen. Values are hidden until revealed, so nearly all of
   * that was decrypting and rendering secrets nobody had asked to see.
   *
   * Rows that are never revealed now hold a `value` of `""` from first
   * render to last, which is what lets `memo` on `VarRow` skip them. Reveal,
   * copy and edit each pull the one value they need; all three were already
   * async, and a single decrypt is ~7 microseconds.
   *
   * This changes when the crypto runs, not what it does — the sequences
   * ADR-002 reasons about are untouched and no key moves anywhere. A side
   * effect worth having: far less plaintext sits in memory at once.
   */
  const [decrypted, setDecrypted] = useState<Record<string, string>>({});

  // A reload replaces every row's ciphertext, so cached plaintext is no
  // longer known to match it. Dropped during render rather than in an effect
  // — React's documented pattern for state that reacts to a change, and the
  // same one the `initialVars` resync above uses.
  const [prevVars, setPrevVars] = useState(vars);
  if (vars !== prevVars) {
    setPrevVars(vars);
    setDecrypted({});
  }

  /**
   * Decrypts the named rows and merges them in, returning the plaintext for
   * the caller to use immediately — a caller can't read it back out of state
   * it just set.
   *
   * Deliberately re-decrypts rather than checking what is already cached:
   * a cache check would have to read current state, which a stable callback
   * can't do without a ref, and the work it would save is microseconds.
   */
  const decryptIds = useCallback(
    async (ids: string[]): Promise<Record<string, string>> => {
      const found = await decryptRows(dek, vars, ids);
      setDecrypted((prev) => ({ ...prev, ...found }));
      return found;
    },
    [vars, dek],
  );

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealAll, setRevealAll] = useState(false);

  // Whatever is on screen has to come back after a reload. `vars` changing
  // drops the cache above — correct, since the ciphertext may have moved
  // under it — but a row the user had revealed would then render as
  // "(empty)" rather than its value. Refill exactly those, and only when
  // something is actually missing, so this settles in one pass instead of
  // re-triggering itself.
  const shownIds = revealAll ? vars.map((v) => v.id) : [...revealed];
  const missingIds = shownIds.filter((id) => decrypted[id] === undefined).join(",");
  useEffect(() => {
    if (!missingIds) return;
    let cancelled = false;
    void (async () => {
      const found = await decryptRows(dek, vars, missingIds.split(","));
      if (!cancelled) setDecrypted((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
  }, [missingIds, vars, dek]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const isProd = isProdEnv(envName);
  const existingKeys = new Set(vars.map((v) => v.key));
  const filtered = query
    ? vars.filter((v) => v.key.toLowerCase().includes(query.toLowerCase()))
    : vars;

  // Every callback handed to a row is wrapped so its identity survives a
  // parent re-render (RM-9). `memo` on `VarRow` is worthless without this: a
  // fresh arrow function per render is a changed prop, and a changed prop is
  // a re-render, so 500 rows would keep re-rendering on every keystroke in
  // the search box exactly as they did before.
  //
  // The id and the value travel as arguments rather than being closed over,
  // which is what lets these have empty dependency lists — a handler that
  // closed over `decrypted` would get a new identity the moment decryption
  // landed, and take the whole table with it.
  const reload = useCallback(async () => {
    const data = await api<{ vars: Row[] }>(`/api/environments/${environmentId}`);
    setVars(data.vars);
    // The environment switcher's counts and the version bar are rendered on
    // the server; without this they stay at whatever they were on load.
    router.refresh();
  }, [environmentId, router]);


  function isRevealed(id: string) {
    return revealAll || revealed.has(id);
  }

  const toggleReveal = useCallback(
    async (id: string) => {
      // Decrypt before flipping the flag, so a row never renders revealed
      // with nothing in it.
      await decryptIds([id]);
      setRevealed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [decryptIds],
  );

  const copy = useCallback(
    async (id: string) => {
      const values = await decryptIds([id]);
      await navigator.clipboard.writeText(values[id] ?? "");
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
    },
    [decryptIds],
  );

  /** Entering edit mode needs the plaintext; the row asks for it here. */
  const requestValue = useCallback(
    async (id: string) => (await decryptIds([id]))[id] ?? "",
    [decryptIds],
  );

  async function revealAllToggle() {
    if (!revealAll) await decryptIds(vars.map((v) => v.id));
    setRevealAll((v) => !v);
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
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={vars.length ? `Filter ${vars.length} key${vars.length === 1 ? "" : "s"}` : "Filter keys"}
            aria-label="Filter keys"
            className="w-full pl-8"
          />
        </div>
        <Button variant="outline" onClick={revealAllToggle} disabled={vars.length === 0}>
          {revealAll ? <EyeOff /> : <Eye />}
          {revealAll ? "Hide values" : "Reveal values"}
        </Button>
        <Button variant="outline" onClick={copyAll} disabled={vars.length === 0}>
          <Copy /> Copy as .env
        </Button>
        <PasteDialog environmentId={environmentId} dek={dek} existingKeys={existingKeys} onDone={reload} />
      </div>


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
                  onToggleReveal={toggleReveal}
                  onCopy={copy}
                  onRequestValue={requestValue}
                  onChanged={reload}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Values are encrypted in your browser. EnvHQ stores only ciphertext.
      </p>
    </div>
  );
}

/**
 * Memoised (RM-9). At 500 variables the table was the whole cost of this
 * screen: mounting it took 436ms and a single keystroke in the search box
 * 53ms, because every keystroke re-rendered the parent and every row with
 * it. Decryption, the suspected culprit, was 3.4ms of that 436 — see
 * `env-editor.render.test.tsx`, which pins the result as a slope rather
 * than a millisecond budget.
 *
 * The props are all primitives, plus `row` (stable while `vars` is) and the
 * parent's `useCallback`-wrapped handlers, so the default shallow comparison
 * is the right one. Anything added here that is constructed during the
 * parent's render — an object literal, an inline arrow, a fresh array —
 * silently undoes this, with no error and no failing test except that one.
 */
const VarRow = memo(function VarRow({
  row,
  value,
  dek,
  revealed,
  copied,
  onToggleReveal,
  onCopy,
  onRequestValue,
  onChanged,
}: {
  row: Row;
  value: string;
  dek: Uint8Array;
  revealed: boolean;
  copied: boolean;
  onToggleReveal: (id: string) => void;
  onCopy: (id: string) => void;
  onRequestValue: (id: string) => Promise<string>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState(row.key);
  const [editValue, setEditValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The plaintext is pulled when editing starts rather than held as a prop:
  // an unrevealed row is never decrypted, so there is nothing to seed from.
  // Awaiting first also means the textarea can't briefly show empty and save
  // that over a real value.
  async function startEditing() {
    setEditValue(await onRequestValue(row.id));
    setKey(row.key);
    setEditing(true);
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
    await api(`/api/vars/${row.id}`, { method: "DELETE" });
    toast.success(`Deleted ${row.key}`);
    await onChanged();
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
          {/* Icon-only, so each needs a name of its own: "Reveal" alone is
              four identical buttons to a screen reader once the table has
              more than one row. */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`${revealed ? "Hide" : "Reveal"} ${row.key}`}
            onClick={() => onToggleReveal(row.id)}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Copy ${row.key}`}
            onClick={() => onCopy(row.id)}
          >
            {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Edit ${row.key}`}
            onClick={startEditing}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Delete ${row.key}`}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${row.key}?`}
          description="It's removed from this environment now. The previous version stays in history, so you can roll back."
          onConfirm={remove}
        />
      </TableCell>
    </TableRow>
  );
});

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
  existingKeys,
  onDone,
}: {
  environmentId: string;
  dek: Uint8Array;
  existingKeys: Set<string>;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  // Parsed as you type, so the dialog can say exactly what an import will
  // do before it does it: an import only ever adds or updates.
  const parsed = content.trim() ? parseEnv(content) : [];
  const added = parsed.filter((p) => !existingKeys.has(p.key));
  const updated = parsed.filter((p) => existingKeys.has(p.key));

  async function readFile(file: File | undefined) {
    if (file) setContent(await file.text());
  }

  async function submit() {
    if (parsed.length === 0) return;
    setBusy(true);
    try {
      const pairs = await Promise.all(
        parsed.map(async (p) => ({ key: p.key, ...(await encryptField(dek, p.value)) })),
      );
      const res = await api<{ created: number; updated: number; total: number }>(
        `/api/environments/${environmentId}/import`,
        { method: "POST", body: { pairs } },
      );
      toast.success(
        `Imported ${res.total} key${res.total === 1 ? "" : "s"}: ${res.created} new, ${res.updated} updated`,
      );
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
      <DialogTrigger render={<Button variant="outline" />}>
        <ClipboardPaste /> Paste .env
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a .env</DialogTitle>
          <DialogDescription>
            Adds new keys and updates existing ones. Nothing is removed. Values are encrypted in
            this browser before they&rsquo;re sent.
          </DialogDescription>
        </DialogHeader>
        <Label htmlFor="paste" className="sr-only">
          .env content
        </Label>
        <Textarea
          id="paste"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void readFile(e.dataTransfer.files[0]);
          }}
          spellCheck={false}
          placeholder={"Paste here, or drop a .env file\n\nDATABASE_URL=postgres://…\nAPI_KEY=sk-…\n# comments are fine"}
          className="min-h-56 font-mono text-sm"
          autoFocus
        />
        <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {content.trim() && parsed.length === 0 ? (
            <span className="text-destructive">No KEY=value lines found yet.</span>
          ) : parsed.length > 0 ? (
            <>
              <span className="text-brand">+ {added.length} new</span>
              <span className="text-amber-600 dark:text-amber-400">~ {updated.length} updated</span>
              <span className="min-w-0 truncate text-muted-foreground">
                {updated.length > 0 && `Overwrites ${updated.map((p) => p.key).join(", ")}`}
              </span>
            </>
          ) : (
            <label className="cursor-pointer text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              or choose a file…
              <input
                type="file"
                accept=".env,text/plain"
                className="sr-only"
                onChange={(e) => void readFile(e.target.files?.[0])}
              />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || parsed.length === 0}>
            {busy ? "Importing…" : parsed.length ? `Import ${parsed.length} key${parsed.length === 1 ? "" : "s"}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
