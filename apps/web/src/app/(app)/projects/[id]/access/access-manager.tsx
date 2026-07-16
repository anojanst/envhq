"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ShieldAlert, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, nativeSelectClass as selectClass } from "@/lib/utils";
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

/** Encodes a picker option's subject as one string value; `parseSubject` reverses it. */
function subjectKey(subjectType: SubjectType, subjectId: string) {
  return `${subjectType}:${subjectId}`;
}

function parseSubject(key: string): { subjectType: SubjectType; subjectId: string } {
  const [subjectType, ...rest] = key.split(":");
  return { subjectType: subjectType as SubjectType, subjectId: rest.join(":") };
}

/**
 * Full-page replacement for the old Manage Access dialog: the per-env
 * restriction panel needs real width to lay out one row per environment,
 * which a `sm:max-w-md` dialog couldn't give it without content spilling out
 * of the box. Grants/environments come from the page's SSR fetch (no load
 * flash for the main table); the org member/group picker still loads
 * client-side on mount, same as the dialog did on open.
 */
export function AccessManager({
  projectId,
  initialGrants,
  initialEnvironments,
}: {
  projectId: string;
  initialGrants: Grant[];
  initialEnvironments: EnvironmentOption[];
}) {
  const [grants, setGrants] = useState<Grant[]>(initialGrants);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>(initialEnvironments);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [groups, setGroups] = useState<GroupOption[] | null>(null);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("viewer");
  const [adding, setAdding] = useState(false);
  const [expandedGrantId, setExpandedGrantId] = useState<string | null>(null);
  const pickersLoading = members === null || groups === null;

  useEffect(() => {
    Promise.all([
      api<{ members: Member[] }>(`/api/projects/${projectId}/access/members`),
      api<{ groups: GroupOption[] }>(`/api/projects/${projectId}/access/groups`),
    ])
      .then(([m, gr]) => {
        setMembers(m.members);
        setGroups(gr.groups);
      })
      .catch((err) => toast.error((err as Error).message));
  }, [projectId]);

  async function reloadGrants() {
    const data = await api<{ grants: Grant[]; environments: EnvironmentOption[] }>(
      `/api/projects/${projectId}/access`,
    );
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

  const grantedUserIds = new Set(grants.filter((g) => g.subjectType === "user").map((g) => g.subjectId));
  const grantedGroupIds = new Set(grants.filter((g) => g.subjectType === "group").map((g) => g.subjectId));
  const pickableMembers = (members ?? []).filter((m) => !grantedUserIds.has(m.userId));
  const pickableGroups = (groups ?? []).filter((g) => !grantedGroupIds.has(g.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Environments</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 size-6" />
                  No one has been granted direct access yet.
                </TableCell>
              </TableRow>
            ) : (
              grants.flatMap((g) => {
                const SubjectIcon = g.subjectType === "group" ? Users : User;
                const isExpanded = expandedGrantId === g.id;
                const isRestricted = !!g.envScope && Object.keys(g.envScope).length > 0;
                const availableCaps = ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[g.role]);

                const mainRow = (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        <SubjectIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{g.name}</span>
                      </span>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="flex flex-wrap items-center gap-1.5 text-xs"
                        onClick={() => setExpandedGrantId(isExpanded ? null : g.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {isRestricted ? (
                          <>
                            <ShieldAlert className="size-3.5 shrink-0 text-amber-600" aria-label="Restricted on some environments" />
                            {Object.entries(g.envScope!).map(([env, role]) => (
                              <span key={env} className="rounded bg-muted px-1.5 py-0.5">
                                {env}: {ROLE_LABEL[role!]}
                              </span>
                            ))}
                          </>
                        ) : (
                          <span className="text-muted-foreground">All environments</span>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => revoke(g)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );

                if (!isExpanded) return [mainRow];

                const expansionRow = (
                  <TableRow key={`${g.id}-envs`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={4}>
                      {environments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No environments yet.</p>
                      ) : (
                        <div className="grid gap-x-6 gap-y-2 py-1 sm:grid-cols-2 lg:grid-cols-3">
                          {environments.map((env) => (
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
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );

                return [mainRow, expansionRow];
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-medium">Add access</h2>
        {pickersLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <form onSubmit={addGrant} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className={cn(selectClass, "flex-1")}
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
              className={selectClass}
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
          </form>
        )}
      </div>
    </div>
  );
}
