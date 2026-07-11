"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Copy, Check, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";

interface TokenMeta {
  id: string;
  name: string;
  kind: string;
  capability: string;
  projectId: string | null;
  projectName: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

const EXPIRY_OPTIONS = [
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
  { label: "Never", value: "0" },
];

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function isExpired(t: TokenMeta): boolean {
  return !!t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now();
}

function expiryLabel(t: TokenMeta): string {
  if (!t.expiresAt) return "never";
  const d = new Date(t.expiresAt);
  if (d.getTime() <= Date.now()) return "expired";
  return d.toLocaleDateString();
}

export function TokensManager({
  initialTokens,
  projects,
}: {
  initialTokens: TokenMeta[];
  projects: ProjectOption[];
}) {
  const [tokens, setTokens] = useState<TokenMeta[]>(initialTokens);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [capability, setCapability] = useState("write");
  const [expiresInDays, setExpiresInDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function resetForm() {
    setName("");
    setProjectId("");
    setCapability("write");
    setExpiresInDays("90");
  }

  async function reload() {
    const data = await api<{ tokens: TokenMeta[] }>("/api/tokens");
    setTokens(data.tokens);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api<{ token: string }>("/api/tokens", {
        method: "POST",
        body: {
          name: name.trim(),
          projectId: projectId || undefined,
          capability,
          expiresInDays: Number(expiresInDays),
        },
      });
      setNewToken(data.token);
      resetForm();
      setCreateOpen(false);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: TokenMeta) {
    if (!confirm(`Revoke "${token.name}"? Any CLI using it will stop working.`)) return;
    try {
      await api(`/api/tokens/${token.id}`, { method: "DELETE" });
      toast.success("Token revoked");
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function copyToken() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" /> New token
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>Create CLI token</DialogTitle>
                <DialogDescription>
                  Scope it to a project and access level, and pick when it expires.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="token-name">Token name</Label>
                  <Input
                    id="token-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ci-deploy"
                    autoFocus
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="token-project">Project</Label>
                  <select
                    id="token-project"
                    className={selectClass}
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">All projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="token-capability">Access</Label>
                    <select
                      id="token-capability"
                      className={selectClass}
                      value={capability}
                      onChange={(e) => setCapability(e.target.value)}
                    >
                      <option value="write">Read &amp; write</option>
                      <option value="read">Read-only</option>
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="token-expiry">Expires</Label>
                    <select
                      id="token-expiry"
                      className={selectClass}
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(e.target.value)}
                    >
                      {EXPIRY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Show-once token reveal */}
      <Dialog open={!!newToken} onOpenChange={(o) => !o && setNewToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your token now</DialogTitle>
            <DialogDescription>
              This is the only time it will be shown. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-sm">
              {newToken}
            </code>
            <Button size="icon" variant="outline" onClick={copyToken}>
              {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Use it in CI with: <code>ENVSYNC_TOKEN=&lt;token&gt;</code>
          </p>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Access</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  <KeyRound className="mx-auto mb-2 size-6" />
                  No tokens yet. Create one to use the CLI.
                </TableCell>
              </TableRow>
            ) : (
              tokens.map((t) => (
                <TableRow key={t.id} className={cn(isExpired(t) && "opacity-50")}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.projectId ? (t.projectName ?? "—") : "All projects"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.capability === "read" ? "Read-only" : "Read & write"}
                  </TableCell>
                  <TableCell className={cn("text-muted-foreground", isExpired(t) && "text-destructive")}>
                    {expiryLabel(t)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => revoke(t)}>
                      <Trash2 className="size-4" />
                    </Button>
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
