"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ShieldAlert, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";

type Role = "viewer" | "editor" | "admin";
type SubjectType = "user" | "group";
/** Per-env role cap on a grant, e.g. `{ prod: "viewer" }` — envs absent from the map inherit the grant's role. */
type EnvScope = Partial<Record<string, Role>>;

interface Grant {
  id: string;
  subjectType: SubjectType;
  subjectId: string;
  name: string;
  role: Role;
  envScope: EnvScope | null;
  createdAt: string;
}

interface Member {
  userId: string;
  name: string;
  email: string;
  imageUrl: string;
}

interface GroupOption {
  id: string;
  name: string;
  memberCount: number;
}

interface EnvironmentOption {
  id: string;
  name: string;
}

const ROLES: Role[] = ["viewer", "editor", "admin"];
const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };
const ROLE_LABEL: Record<Role, string> = { viewer: "Viewer", editor: "Editor", admin: "Admin" };

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Encodes a picker option's subject as one string value; `parseSubject` reverses it. */
function subjectKey(subjectType: SubjectType, subjectId: string) {
  return `${subjectType}:${subjectId}`;
}

function parseSubject(key: string): { subjectType: SubjectType; subjectId: string } {
  const [subjectType, ...rest] = key.split(":");
  return { subjectType: subjectType as SubjectType, subjectId: rest.join(":") };
}

export function ShareDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // `null` doubles as "not loaded yet" so `loading` derives from data
  // presence instead of a separate flag — avoids setting state synchronously
  // at the top of the effect below (react-hooks/set-state-in-effect).
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentOption[] | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("viewer");
  const [adding, setAdding] = useState(false);
  const [expandedGrantId, setExpandedGrantId] = useState<string | null>(null);
  const loading = grants === null || members === null || groups === null || environments === null;

  useEffect(() => {
    if (!open) return;
    Promise.all([
      api<{ grants: Grant[]; environments: EnvironmentOption[] }>(`/api/projects/${projectId}/access`),
      api<{ members: Member[] }>(`/api/projects/${projectId}/access/members`),
      api<{ groups: GroupOption[] }>(`/api/projects/${projectId}/access/groups`),
    ])
      .then(([g, m, gr]) => {
        setGrants(g.grants);
        setEnvironments(g.environments);
        setMembers(m.members);
        setGroups(gr.groups);
      })
      .catch((err) => toast.error((err as Error).message));
  }, [open, projectId]);

  async function reloadGrants() {
    const data = await api<{ grants: Grant[]; environments: EnvironmentOption[] }>(`/api/projects/${projectId}/access`);
    setGrants(data.grants);
    setEnvironments(data.environments);
  }

  /** Set (or clear, when `cap` is `""`) one environment's role cap on a grant, leaving the others untouched. */
  async function updateEnvCap(grant: Grant, envName: string, cap: Role | "") {
    const nextScope: EnvScope = { ...grant.envScope };
    if (cap) nextScope[envName] = cap;
    else delete nextScope[envName];
    try {
      await api(`/api/projects/${projectId}/access`, {
        method: "POST",
        body: {
          subjectType: grant.subjectType,
          subjectId: grant.subjectId,
          role: grant.role,
          envScope: Object.keys(nextScope).length > 0 ? nextScope : null,
        },
      });
      await reloadGrants();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function addGrant(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSubject) return;
    setAdding(true);
    try {
      await api(`/api/projects/${projectId}/access`, {
        method: "POST",
        body: { ...parseSubject(selectedSubject), role: selectedRole },
      });
      toast.success("Access granted");
      setSelectedSubject("");
      await reloadGrants();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function changeRole(grant: Grant, role: Role) {
    try {
      await api(`/api/projects/${projectId}/access`, {
        method: "POST",
        body: { subjectType: grant.subjectType, subjectId: grant.subjectId, role },
      });
      await reloadGrants();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function revoke(grant: Grant) {
    if (!confirm(`Remove ${grant.name}'s access?`)) return;
    try {
      await api(`/api/projects/${projectId}/access/${grant.id}`, { method: "DELETE" });
      toast.success("Access removed");
      await reloadGrants();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const grantedUserIds = new Set((grants ?? []).filter((g) => g.subjectType === "user").map((g) => g.subjectId));
  const grantedGroupIds = new Set((grants ?? []).filter((g) => g.subjectType === "group").map((g) => g.subjectId));
  const pickableMembers = (members ?? []).filter((m) => !grantedUserIds.has(m.userId));
  const pickableGroups = (groups ?? []).filter((g) => !grantedGroupIds.has(g.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage access</DialogTitle>
          <DialogDescription>Grant org members or groups a role on this project.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : grants.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <Users className="size-5" />
              No one has been granted direct access yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {grants.map((g) => {
                const SubjectIcon = g.subjectType === "group" ? Users : User;
                const isExpanded = expandedGrantId === g.id;
                const isRestricted = !!g.envScope && Object.keys(g.envScope).length > 0;
                const availableCaps = ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[g.role]);
                return (
                  <li key={g.id} className="rounded-md border">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium"
                        onClick={() => setExpandedGrantId(isExpanded ? null : g.id)}
                        title="Restrict access to specific environments"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <SubjectIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{g.name}</span>
                        {isRestricted && (
                          <ShieldAlert className="size-3.5 shrink-0 text-amber-600" aria-label="Restricted on some environments" />
                        )}
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <select
                          className={selectClass}
                          value={g.role}
                          onChange={(e) => changeRole(g, e.target.value as Role)}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => revoke(g)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="flex flex-col gap-1.5 border-t bg-muted/30 px-3 py-2">
                        {(environments ?? []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No environments yet.</p>
                        ) : (
                          (environments ?? []).map((env) => (
                            <div key={env.id} className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-muted-foreground">{env.name}</span>
                              <select
                                className={cn(selectClass, "h-7 text-xs")}
                                value={g.envScope?.[env.name] ?? ""}
                                onChange={(e) => updateEnvCap(g, env.name, e.target.value as Role | "")}
                              >
                                <option value="">Full access ({ROLE_LABEL[g.role]})</option>
                                {availableCaps.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABEL[r]} only
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!loading && (
          <form onSubmit={addGrant} className="flex flex-col gap-2 border-t pt-4">
            <select
              className={cn(selectClass, "w-full")}
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
            <div className="flex items-center gap-2">
              <select
                className={cn(selectClass, "flex-1")}
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={adding || !selectedSubject}>
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
