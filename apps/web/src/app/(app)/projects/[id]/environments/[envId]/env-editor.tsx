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
import { api } from "@/lib/client";
import { formatRelativeTime } from "@/lib/utils";
import { isProdEnv } from "@/components/project-visuals";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";

interface Row {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
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
  const router = useRouter();
  const [vars, setVars] = useState<Row[]>(initialVars);
  // Resync when the server component re-renders with fresh vars (e.g. after
  // a version rollback triggers router.refresh() from a sibling component) —
  // useState's initial value only applies on mount, so without this the
  // table would keep showing stale data after an out-of-band refresh.
  useEffect(() => setVars(initialVars), [initialVars]);
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
      const data = await api<{ content: string; count: number }>(
        `/api/environments/${environmentId}/export`,
      );
      if (!data.content) {
        toast.info("Nothing to copy — this environment is empty");
        return;
      }
      await navigator.clipboard.writeText(data.content);
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
        <PasteDialog environmentId={environmentId} onDone={reload} />
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
            <AddRow environmentId={environmentId} onAdded={reload} />
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
                  revealed={isRevealed(row.id)}
                  copied={copiedId === row.id}
                  onToggleReveal={() => toggleReveal(row.id)}
                  onCopy={() => copy(row.value, row.id)}
                  onChanged={reload}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Environment <code>{envName}</code> · values are encrypted at rest.
      </p>
    </div>
  );
}

function VarRow({
  row,
  revealed,
  copied,
  onToggleReveal,
  onCopy,
  onChanged,
}: {
  row: Row;
  revealed: boolean;
  copied: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState(row.key);
  const [value, setValue] = useState(row.value);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/api/vars/${row.id}`, {
        method: "PATCH",
        body: { key: key.trim(), value },
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
            value={value}
            onChange={(e) => setValue(e.target.value)}
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
                setValue(row.value);
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
          {revealed ? row.value || <em className="not-italic opacity-50">(empty)</em> : "••••••••••••"}
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
  onAdded,
}: {
  environmentId: string;
  onAdded: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!key.trim()) return;
    setBusy(true);
    try {
      await api(`/api/environments/${environmentId}/vars`, {
        method: "POST",
        body: { key: key.trim(), value },
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
  onDone,
}: {
  environmentId: string;
  onDone: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await api<{ created: number; updated: number; total: number }>(
        `/api/environments/${environmentId}/import`,
        { method: "POST", body: { content } },
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
