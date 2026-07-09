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
import { api } from "@/lib/client";

interface TokenMeta {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export function TokensManager({ initialTokens }: { initialTokens: TokenMeta[] }) {
  const [tokens, setTokens] = useState<TokenMeta[]>(initialTokens);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        body: { name: name.trim() },
      });
      setNewToken(data.token);
      setName("");
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
                  Give it a name so you can recognize it later (e.g. “laptop”).
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 py-4">
                <Label htmlFor="token-name">Token name</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="laptop"
                  autoFocus
                />
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
            Use it with: <code>envsync login --token &lt;token&gt;</code>
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
              <TableHead>Last used</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  <KeyRound className="mx-auto mb-2 size-6" />
                  No tokens yet. Create one to use the CLI.
                </TableCell>
              </TableRow>
            ) : (
              tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString() : "never"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
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
