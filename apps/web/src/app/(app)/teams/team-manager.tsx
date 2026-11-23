"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Link2, LogOut, Plus, Trash2, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn, nativeSelectClass } from "@/lib/utils";
import { api } from "@/lib/client";

type Role = "admin" | "member";

interface Member {
  userId: string;
  name: string;
  email: string;
  imageUrl: string;
  role: Role;
}

interface Invite {
  id: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
}

/** "New team" — one field, so a dialog is the right size for it. */
export function NewTeamButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { org } = await api<{ org: { id: string } }>("/api/orgs", { method: "POST", body: { name: name.trim() } });
      toast.success("Team created");
      setOpen(false);
      setName("");
      router.push(`/teams?org=${encodeURIComponent(org.id)}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" /> New team
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={create}>
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="team-name">Name</Label>
            <Input id="team-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
            <p className="text-xs text-muted-foreground">You&rsquo;ll be its admin. Invite people once it exists.</p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

function relative(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

type Confirm =
  | { kind: "remove"; member: Member }
  | { kind: "leave" }
  | { kind: "delete" }
  | null;

export function TeamManager({
  org,
  role,
  currentUserId,
  members,
  invites,
  isAdmin,
}: {
  org: { id: string; name: string; personal: boolean };
  role: Role;
  currentUserId: string;
  members: Member[];
  invites: Invite[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const base = `/api/orgs/${encodeURIComponent(org.id)}`;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(org.name);

  const adminCount = members.filter((m) => m.role === "admin").length;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, next: Role) {
    await run(
      () => api(`${base}/members/${encodeURIComponent(member.userId)}`, { method: "PATCH", body: { role: next } }),
      `${member.name} is now ${next === "admin" ? "an admin" : "a member"}`,
    );
  }

  async function createLink() {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(`${base}/invites`, { method: "POST", body: { role: inviteRole } });
      setNewLink(url);
      setCopied(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!newLink) return;
    await navigator.clipboard.writeText(newLink);
    setCopied(true);
  }

  async function confirmAction() {
    if (!confirm) return;
    if (confirm.kind === "remove") {
      await run(
        () => api(`${base}/members/${encodeURIComponent(confirm.member.userId)}`, { method: "DELETE" }),
        `${confirm.member.name} removed`,
      );
    } else if (confirm.kind === "leave") {
      const ok = await run(() => api(`${base}/members/${encodeURIComponent(currentUserId)}`, { method: "DELETE" }), `You left ${org.name}`);
      if (ok) router.push("/teams");
    } else {
      const ok = await run(() => api(base, { method: "DELETE" }), `${org.name} deleted`);
      if (ok) router.push("/teams");
    }
    setConfirm(null);
  }

  if (org.personal) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{org.name}</CardTitle>
          <CardDescription>
            Your personal workspace — just you. To work with other people, create a team and invite them; projects
            you create in a team are shared with it.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Members <span className="text-sm font-normal text-muted-foreground">{members.length}</span>
          </CardTitle>
          <CardDescription>
            Admins can manage the team and have admin access to every project in it. Members see the projects they&rsquo;re
            granted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              const lastAdmin = m.role === "admin" && adminCount <= 1;
              return (
                <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap">
                  <Avatar className="size-8">
                    {m.imageUrl ? <AvatarImage src={m.imageUrl} alt="" /> : null}
                    <AvatarFallback>{initials(m.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.name}
                      {isSelf ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
                    </p>
                    {m.email ? <p className="truncate text-xs text-muted-foreground">{m.email}</p> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin ? (
                      <select
                        className={cn(nativeSelectClass, "h-8")}
                        value={m.role}
                        disabled={busy || lastAdmin}
                        title={lastAdmin ? "A team needs at least one admin" : undefined}
                        aria-label={`Role for ${m.name}`}
                        onChange={(e) => changeRole(m, e.target.value as Role)}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                        {m.role === "admin" ? "Admin" : "Member"}
                      </Badge>
                    )}
                    {isSelf ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busy || lastAdmin}
                        title={lastAdmin ? "Make someone else admin before leaving" : "Leave team"}
                        aria-label="Leave team"
                        onClick={() => setConfirm({ kind: "leave" })}
                      >
                        <LogOut className="size-4" />
                      </Button>
                    ) : isAdmin ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        disabled={busy || lastAdmin}
                        aria-label={`Remove ${m.name}`}
                        onClick={() => setConfirm({ kind: "remove", member: m })}
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite people</CardTitle>
            <CardDescription>
              Create a link and send it however you like. Each link works once and expires after 7 days. Whoever opens it
              signs in and joins with the role you pick.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={cn(nativeSelectClass, "h-9")}
                value={inviteRole}
                aria-label="Role for the invited person"
                onChange={(e) => setInviteRole(e.target.value as Role)}
              >
                <option value="member">as Member</option>
                <option value="admin">as Admin</option>
              </select>
              <Button onClick={createLink} disabled={busy}>
                <Link2 className="size-4" /> Create invite link
              </Button>
            </div>

            {newLink ? (
              <div className="flex flex-col gap-1.5 rounded-lg border border-brand/40 bg-brand/5 p-3">
                <p className="text-xs font-medium">Copy this link now — it won&rsquo;t be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs">{newLink}</code>
                  <Button variant="outline" size="sm" onClick={copyLink}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>
            ) : null}

            {invites.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Pending links</p>
                <ul className="divide-y rounded-lg border">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Badge variant="secondary">{i.role === "admin" ? "Admin" : "Member"}</Badge>
                      <span className="flex-1 text-muted-foreground">Expires {relative(i.expiresAt)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          run(() => api(`${base}/invites/${i.id}`, { method: "DELETE" }), "Invite link revoked")
                        }
                      >
                        Revoke
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card className="ring-destructive/30">
          <CardHeader>
            <CardTitle>Team settings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => api(base, { method: "PATCH", body: { name: name.trim() } }), "Team renamed");
              }}
            >
              <div className="grid flex-1 gap-1.5">
                <Label htmlFor="team-rename">Team name</Label>
                <Input id="team-rename" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </div>
              <Button type="submit" variant="outline" disabled={busy || !name.trim() || name.trim() === org.name}>
                Save
              </Button>
            </form>
            <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Delete this team</p>
                <p className="text-xs text-muted-foreground">Only possible once it has no projects.</p>
              </div>
              <Button variant="destructive" disabled={busy} onClick={() => setConfirm({ kind: "delete" })}>
                <Trash2 className="size-4" /> Delete team
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isAdmin && role === "member" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="size-3.5" /> Only team admins can invite people or change roles.
        </p>
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "remove"
                ? `Remove ${confirm.member.name}?`
                : confirm?.kind === "leave"
                  ? `Leave ${org.name}?`
                  : `Delete ${org.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "The team, its groups and its pending invite links are deleted. This can't be undone."
                : confirm?.kind === "leave"
                  ? "Your access to this team's projects ends now, including any direct grants and group memberships. You'll need a new invite to come back."
                  : "Their access to this team's projects ends now, including any direct grants and group memberships. Projects they could decrypt are marked for key rotation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirmAction}>
              {confirm?.kind === "remove" ? "Remove" : confirm?.kind === "leave" ? "Leave team" : "Delete team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
