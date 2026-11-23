import { randomUUID } from "node:crypto";
import { and, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  accessGrants,
  groupMembers,
  groups,
  orgInvites,
  orgMembers,
  orgs,
  projectKeys,
  projects,
} from "@/db/schema";
import { generateToken, hashToken } from "@/lib/crypto";
import type { OrgRole } from "@/lib/org-store";

/**
 * Every write to orgs, memberships and invites (self-hosting phase 4).
 * Server-only. Orgs live only in Postgres and change only through here —
 * never because an identity provider said so (see CLAUDE.md).
 *
 * Authorization is the caller's job: routes check `getOrgRole(...) ===
 * "admin"` before calling a mutation. What this module enforces are the
 * invariants that no caller may break:
 *   - an org always keeps at least one admin;
 *   - a personal org has exactly one member, its owner, and can't be deleted;
 *   - removing someone from an org removes every way they had into its
 *     projects (direct grants, group memberships, key wraps), not just the
 *     membership row — access.ts honours grants independently of membership.
 *
 * Failures that a route should show the user are thrown as `OrgRuleError`.
 */

export class OrgRuleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "OrgRuleError";
  }
}

/** Invite links last a week, then die. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_NAME = 100;

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) throw new OrgRuleError("A team needs a name.", 400);
  if (name.length > MAX_NAME) throw new OrgRuleError(`Team names are at most ${MAX_NAME} characters.`, 400);
  return name;
}

async function requireTeamOrg(orgId: string) {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  if (!org) throw new OrgRuleError("Team not found", 404);
  return org;
}

/** A new team org, with its creator as the only admin. */
export async function createTeamOrg(userId: string, rawName: unknown): Promise<{ id: string; name: string }> {
  const name = cleanName(rawName);
  const id = `org_${randomUUID().replaceAll("-", "")}`;
  await db.transaction(async (tx) => {
    await tx.insert(orgs).values({ id, name, personal: false, createdByUserId: userId });
    await tx.insert(orgMembers).values({ orgId: id, userId, role: "admin" });
  });
  return { id, name };
}

export async function renameOrg(orgId: string, rawName: unknown): Promise<void> {
  const name = cleanName(rawName);
  await requireTeamOrg(orgId);
  await db.update(orgs).set({ name, updatedAt: new Date() }).where(eq(orgs.id, orgId));
}

/**
 * Deletes a team org. Refused while it still owns projects: deleting the org
 * would orphan their ciphertext and grants, and "delete every project too"
 * is too large a side effect to hide behind one button.
 */
export async function deleteTeamOrg(orgId: string): Promise<void> {
  const org = await requireTeamOrg(orgId);
  if (org.personal) throw new OrgRuleError("Your personal workspace can't be deleted.", 409);
  const [{ n }] = await db.select({ n: count() }).from(projects).where(eq(projects.orgId, orgId));
  if (n > 0) throw new OrgRuleError(`Move or delete this team's ${n} project(s) first.`, 409);
  await db.transaction(async (tx) => {
    const groupIds = (await tx.select({ id: groups.id }).from(groups).where(eq(groups.orgId, orgId))).map((g) => g.id);
    if (groupIds.length) {
      await tx.delete(groupMembers).where(inArray(groupMembers.groupId, groupIds));
      await tx.delete(groups).where(inArray(groups.id, groupIds));
    }
    await tx.delete(orgs).where(eq(orgs.id, orgId)); // cascades members and invites
  });
}

async function adminCount(orgId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin")));
  return n;
}

async function currentRole(orgId: string, userId: string): Promise<OrgRole | null> {
  const [row] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function setMemberRole(orgId: string, userId: string, role: unknown): Promise<void> {
  if (role !== "admin" && role !== "member") throw new OrgRuleError("Role must be admin or member.", 400);
  const org = await requireTeamOrg(orgId);
  if (org.personal) throw new OrgRuleError("A personal workspace has one member, its owner.", 409);
  const existing = await currentRole(orgId, userId);
  if (!existing) throw new OrgRuleError("Member not found", 404);
  if (existing === "admin" && role === "member" && (await adminCount(orgId)) <= 1) {
    throw new OrgRuleError("A team needs at least one admin. Make someone else admin first.", 409);
  }
  await db
    .update(orgMembers)
    .set({ role })
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
}

/**
 * Removes a member — or, when `userId` is the caller, lets them leave.
 * Takes every way in with it: their direct grants on this org's projects,
 * their memberships in this org's groups, and their key wraps, marking those
 * projects for DEK rotation exactly as revoking a grant does. All in one
 * transaction, so there is no moment where they are out of the org but
 * still hold a grant.
 */
export async function removeMember(orgId: string, userId: string): Promise<void> {
  const org = await requireTeamOrg(orgId);
  if (org.personal) throw new OrgRuleError("A personal workspace has one member, its owner.", 409);
  const existing = await currentRole(orgId, userId);
  if (!existing) throw new OrgRuleError("Member not found", 404);
  if (existing === "admin" && (await adminCount(orgId)) <= 1) {
    throw new OrgRuleError("A team needs at least one admin. Make someone else admin first.", 409);
  }

  await db.transaction(async (tx) => {
    const projectIds = (await tx.select({ id: projects.id }).from(projects).where(eq(projects.orgId, orgId))).map(
      (p) => p.id,
    );
    const groupIds = (await tx.select({ id: groups.id }).from(groups).where(eq(groups.orgId, orgId))).map((g) => g.id);

    if (projectIds.length) {
      await tx
        .delete(accessGrants)
        .where(
          and(
            inArray(accessGrants.projectId, projectIds),
            eq(accessGrants.subjectType, "user"),
            eq(accessGrants.subjectId, userId),
          ),
        );
      const dropped = await tx
        .delete(projectKeys)
        .where(and(inArray(projectKeys.projectId, projectIds), eq(projectKeys.subjectUserId, userId)))
        .returning({ projectId: projectKeys.projectId });
      const rotate = [...new Set(dropped.map((d) => d.projectId))];
      if (rotate.length) await tx.update(projects).set({ keyRotationPending: true }).where(inArray(projects.id, rotate));
    }
    if (groupIds.length) {
      await tx
        .delete(groupMembers)
        .where(and(inArray(groupMembers.groupId, groupIds), eq(groupMembers.userId, userId)));
    }
    await tx.delete(orgMembers).where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)));
  });
}

export interface InviteSummary {
  id: string;
  role: OrgRole;
  createdAt: Date;
  expiresAt: Date;
}

/** A new single-use invite. The token is returned once and only its hash is kept. */
export async function createInvite(
  orgId: string,
  createdByUserId: string,
  role: unknown,
): Promise<InviteSummary & { token: string }> {
  if (role !== "admin" && role !== "member") throw new OrgRuleError("Role must be admin or member.", 400);
  const org = await requireTeamOrg(orgId);
  if (org.personal) throw new OrgRuleError("Create a team to invite people — a personal workspace is just you.", 409);
  const token = generateToken();
  const [row] = await db
    .insert(orgInvites)
    .values({ orgId, tokenHash: hashToken(token), role, createdByUserId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
    .returning();
  return { id: row!.id, role: row!.role, createdAt: row!.createdAt, expiresAt: row!.expiresAt, token };
}

/** Invites that can still be used — unaccepted and unexpired. */
export async function listPendingInvites(orgId: string): Promise<InviteSummary[]> {
  return db
    .select({ id: orgInvites.id, role: orgInvites.role, createdAt: orgInvites.createdAt, expiresAt: orgInvites.expiresAt })
    .from(orgInvites)
    .where(and(eq(orgInvites.orgId, orgId), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())))
    .orderBy(orgInvites.createdAt);
}

export async function revokeInvite(orgId: string, inviteId: string): Promise<boolean> {
  const deleted = await db
    .delete(orgInvites)
    .where(and(eq(orgInvites.id, inviteId), eq(orgInvites.orgId, orgId), isNull(orgInvites.acceptedAt)))
    .returning({ id: orgInvites.id });
  return deleted.length > 0;
}

/** What an invite link shows before it's accepted — the team's name, nothing about its members. */
export async function previewInvite(token: string): Promise<{ orgName: string; role: OrgRole } | null> {
  const [row] = await db
    .select({ orgName: orgs.name, role: orgInvites.role })
    .from(orgInvites)
    .innerJoin(orgs, eq(orgs.id, orgInvites.orgId))
    .where(
      and(eq(orgInvites.tokenHash, hashToken(token)), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Accepts an invite for `userId`. Single use: the claim and the membership
 * land in one transaction, and the claim only succeeds while the invite is
 * still unaccepted, so two people racing one link can't both get in.
 * Someone already in the team keeps their current role — an invite never
 * demotes, and never promotes past what an admin already chose for them.
 */
export async function acceptInvite(token: string, userId: string): Promise<{ orgId: string }> {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(orgInvites)
      .set({ acceptedAt: new Date(), acceptedByUserId: userId })
      .where(
        and(eq(orgInvites.tokenHash, hashToken(token)), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())),
      )
      .returning({ orgId: orgInvites.orgId, role: orgInvites.role });
    if (!claimed) throw new OrgRuleError("This invite link is invalid, expired or already used.", 404);
    await tx
      .insert(orgMembers)
      .values({ orgId: claimed.orgId, userId, role: claimed.role })
      .onConflictDoNothing({ target: [orgMembers.orgId, orgMembers.userId] });
    return { orgId: claimed.orgId };
  });
}
