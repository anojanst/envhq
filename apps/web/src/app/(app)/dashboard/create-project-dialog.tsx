"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { generateDek, sealToPublicKey, encodeBase64 } from "@envhq/crypto";
import { ProjectAvatar, EnvBadge } from "@/components/project-visuals";
import { useCryptoSession } from "@/components/crypto-session-provider";
import { cn, nativeSelectClass } from "@/lib/utils";
import { api } from "@/lib/client";
import type { OrgOption } from "./projects-browser";

type Role = "viewer" | "editor" | "admin";
type SubjectType = "user" | "group";

interface Member {
  userId: string;
  name: string;
  email: string;
}

interface GroupOption {
  id: string;
  name: string;
  memberCount: number;
}

/** A grant queued locally in the dialog — not sent until the project itself is created. */
interface PendingGrant {
  subjectType: SubjectType;
  subjectId: string;
  name: string;
  role: Role;
}

const NAME_PLACEHOLDER = "acme-api";
const MAX_LENGTH = 60;
const ROLES: Role[] = ["viewer", "editor", "admin"];
const ROLE_LABEL: Record<Role, string> = { viewer: "Viewer", editor: "Editor", admin: "Admin" };

function subjectKey(subjectType: SubjectType, subjectId: string) {
  return `${subjectType}:${subjectId}`;
}

function parseSubject(key: string): { subjectType: SubjectType; subjectId: string } {
  const [subjectType, ...rest] = key.split(":");
  return { subjectType: subjectType as SubjectType, subjectId: rest.join(":") };
}

export function CreateProjectDialog({
  orgs,
  defaultOrgId,
  callerUserId,
}: {
  orgs: OrgOption[];
  defaultOrgId: string;
  callerUserId: string;
}) {
  const router = useRouter();
  const { status: cryptoStatus, publicKey } = useCryptoSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState(defaultOrgId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `null` doubles as "not loaded yet" — see access-manager.tsx for the same
  // pattern. Fetches fail closed (empty, not an error) for a caller who
  // isn't an org admin — they still get their own project via the creator
  // admin-grant, just can't see this org's member/group list to invite from.
  const [members, setMembers] = useState<Member[] | null>(null);
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [pendingGrants, setPendingGrants] = useState<PendingGrant[]>([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("editor");

  const trimmed = name.trim();
  const previewName = trimmed || "your-project";

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api<{ members: Member[] }>(`/api/orgs/members?orgId=${orgId}`),
      api<{ groups: GroupOption[] }>(`/api/groups?orgId=${orgId}`),
    ])
      .then(([m, g]) => {
        setMembers(m.members);
        setGroups(g.groups);
      })
      .catch(() => {
        setMembers([]);
        setGroups([]);
      });
  }, [open, orgId]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Dialog is gone either way; don't carry stale state into the next
      // open (matches the create-environment dialog's reset-on-close).
      setName("");
      setOrgId(defaultOrgId);
      setError(null);
      setMembers(null);
      setGroups(null);
      setAddPeopleOpen(false);
      setPendingGrants([]);
      setSelectedSubject("");
    }
  }

  function addPendingGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSubject) return;
    const { subjectType, subjectId } = parseSubject(selectedSubject);
    const name =
      subjectType === "user"
        ? (members ?? []).find((m) => m.userId === subjectId)?.name
        : (groups ?? []).find((g) => g.id === subjectId)?.name;
    setPendingGrants((prev) => [...prev, { subjectType, subjectId, name: name ?? subjectId, role: selectedRole }]);
    setSelectedSubject("");
  }

  function removePendingGrant(subjectType: SubjectType, subjectId: string) {
    setPendingGrants((prev) => prev.filter((g) => !(g.subjectType === subjectType && g.subjectId === subjectId)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const { project } = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: {
          name: trimmed,
          orgId,
          grants: pendingGrants.map(({ subjectType, subjectId, role }) => ({ subjectType, subjectId, role })),
        },
      });

      // Best-effort (M6 PR2): register the creator's own wrapped DEK if
      // their crypto session happens to be unlocked. Not required for the
      // project to work yet — value encryption doesn't read this until a
      // later PR — so a locked/not-set-up session just skips it silently
      // rather than blocking project creation on ZK onboarding.
      if (cryptoStatus === "unlocked" && publicKey) {
        try {
          const dek = await generateDek();
          const wrappedDek = await sealToPublicKey(encodeBase64(dek), publicKey);
          await api(`/api/projects/${project.id}/keys`, { method: "POST", body: { wrappedDek } });
        } catch {
          // Non-fatal — the project itself was created successfully either way.
        }
      }

      toast.success(`Project "${trimmed}" created`);
      handleOpenChange(false);
      router.refresh();
    } catch (err) {
      // Stays inline (not just a toast) since the dialog remains open on
      // failure and the user shouldn't lose their place to find out why.
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const pendingKeys = new Set(pendingGrants.map((g) => subjectKey(g.subjectType, g.subjectId)));
  const pickableMembers = (members ?? []).filter(
    (m) => m.userId !== callerUserId && !pendingKeys.has(subjectKey("user", m.userId)),
  );
  const pickableGroups = (groups ?? []).filter((g) => !pendingKeys.has(subjectKey("group", g.id)));
  const hasAnyoneToAdd =
    (members ?? []).some((m) => m.userId !== callerUserId) || (groups ?? []).length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" /> New project
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Projects group the environments that hold your variables. We&rsquo;ll
              add a <span className="font-medium text-foreground">dev</span>{" "}
              environment to start you off.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <ProjectAvatar name={previewName} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    !trimmed && "text-muted-foreground",
                  )}
                >
                  {previewName}
                </p>
                <div className="mt-1">
                  <EnvBadge name="dev" />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={NAME_PLACEHOLDER}
                maxLength={MAX_LENGTH}
                autoFocus
                aria-invalid={!!error}
              />
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

            {orgs.length > 1 ? (
              <div className="grid gap-2">
                <Label htmlFor="project-org">Organization</Label>
                <select
                  id="project-org"
                  className={nativeSelectClass}
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hasAnyoneToAdd ? (
              <div className="rounded-lg border">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 px-3 py-2 text-sm font-medium"
                  onClick={() => setAddPeopleOpen((o) => !o)}
                >
                  {addPeopleOpen ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  Add people
                  {pendingGrants.length > 0 ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                      {pendingGrants.length}
                    </span>
                  ) : null}
                </button>

                {addPeopleOpen ? (
                  <div className="flex flex-col gap-2 border-t p-3">
                    {pendingGrants.length > 0 ? (
                      <ul className="flex flex-col gap-1.5">
                        {pendingGrants.map((g) => {
                          const SubjectIcon = g.subjectType === "group" ? Users : User;
                          return (
                            <li
                              key={subjectKey(g.subjectType, g.subjectId)}
                              className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-sm"
                            >
                              <span className="flex min-w-0 items-center gap-1.5 truncate">
                                <SubjectIcon className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{g.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {ROLE_LABEL[g.role]}
                                </span>
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0"
                                onClick={() => removePendingGrant(g.subjectType, g.subjectId)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}

                    <div className="flex items-center gap-2">
                      <select
                        className={cn(nativeSelectClass, "flex-1")}
                        value={selectedSubject}
                        onChange={(e) => setSelectedSubject(e.target.value)}
                      >
                        <option value="">Select a member or group…</option>
                        {pickableMembers.length > 0 && (
                          <optgroup label="People">
                            {pickableMembers.map((m) => (
                              <option key={m.userId} value={subjectKey("user", m.userId)}>
                                {m.name} ({m.email})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {pickableGroups.length > 0 && (
                          <optgroup label="Groups">
                            {pickableGroups.map((g) => (
                              <option key={g.id} value={subjectKey("group", g.id)}>
                                {g.name} ({g.memberCount} member{g.memberCount === 1 ? "" : "s"})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <select
                        className={nativeSelectClass}
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value as Role)}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <Button type="button" variant="outline" disabled={!selectedSubject} onClick={addPendingGrant}>
                        Add
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={saving || !trimmed}>
              {saving ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
