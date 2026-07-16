"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users, UserPlus } from "lucide-react";
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
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn, nativeSelectClass as selectClass } from "@/lib/utils";
import { api } from "@/lib/client";

interface GroupMeta {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface Member {
  userId: string;
  name: string;
}

interface OrgMember {
  userId: string;
  name: string;
  email: string;
  imageUrl: string;
}

export function GroupsManager({
  orgId,
  initialGroups,
}: {
  /** `null` when `?org=` named an org the caller doesn't belong to (tampered URL) — the manager renders a plain message instead. */
  orgId: string | null;
  initialGroups: GroupMeta[];
}) {
  const [groups, setGroups] = useState<GroupMeta[]>(initialGroups);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const [membersGroup, setMembersGroup] = useState<GroupMeta | null>(null);
  // `null` doubles as "not loaded yet" — see access-manager.tsx for the same pattern.
  const [members, setMembers] = useState<Member[] | null>(null);
  const [orgMembers, setOrgMembers] = useState<OrgMember[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [adding, setAdding] = useState(false);

  async function reload() {
    const data = await api<{ groups: GroupMeta[] }>(`/api/groups?orgId=${orgId}`);
    setGroups(data.groups);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/groups", { method: "POST", body: { name: name.trim(), orgId } });
      toast.success("Group created");
      setName("");
      setCreateOpen(false);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: GroupMeta) {
    if (!confirm(`Delete group "${group.name}"?`)) return;
    try {
      await api(`/api/groups/${group.id}`, { method: "DELETE" });
      toast.success("Group deleted");
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function openMembers(group: GroupMeta) {
    setMembersGroup(group);
    setMembers(null);
    setOrgMembers(null);
    setSelectedUserId("");
    Promise.all([
      api<{ members: Member[] }>(`/api/groups/${group.id}/members`),
      api<{ members: OrgMember[] }>(`/api/orgs/members?orgId=${orgId}`),
    ])
      .then(([m, om]) => {
        setMembers(m.members);
        setOrgMembers(om.members);
      })
      .catch((err) => toast.error((err as Error).message));
  }

  async function reloadMembers(groupId: string) {
    const data = await api<{ members: Member[] }>(`/api/groups/${groupId}/members`);
    setMembers(data.members);
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!membersGroup || !selectedUserId) return;
    setAdding(true);
    try {
      await api(`/api/groups/${membersGroup.id}/members`, {
        method: "POST",
        body: { userId: selectedUserId },
      });
      setSelectedUserId("");
      await reloadMembers(membersGroup.id);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function removeMember(userId: string) {
    if (!membersGroup) return;
    try {
      await api(`/api/groups/${membersGroup.id}/members/${userId}`, { method: "DELETE" });
      await reloadMembers(membersGroup.id);
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const memberIds = new Set((members ?? []).map((m) => m.userId));
  const pickable = (orgMembers ?? []).filter((m) => !memberIds.has(m.userId));

  if (!orgId) {
    return (
      <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
        You don&rsquo;t have access to that organization.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" /> New group
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={create}>
              <DialogHeader>
                <DialogTitle>Create group</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2 py-4">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 size-6" />
                  No groups yet.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-muted-foreground">{g.memberCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => openMembers(g)}
                    >
                      <UserPlus className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7" onClick={() => remove(g)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!membersGroup} onOpenChange={(o) => !o && setMembersGroup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Members of {membersGroup?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {members === null || orgMembers === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : members.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {members.map((m) => (
                  <li
                    key={m.userId}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="truncate text-sm font-medium">{m.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => removeMember(m.userId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {members !== null && orgMembers !== null && (
            <form onSubmit={addMember} className="flex items-center gap-2 border-t pt-4">
              <select
                className={cn(selectClass, "flex-1")}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Select a member…</option>
                {pickable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} ({m.email})
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={adding || !selectedUserId}>
                {adding ? "Adding…" : "Add"}
              </Button>
            </form>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMembersGroup(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
