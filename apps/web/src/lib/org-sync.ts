import { clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { personalOrgs } from "@/db/schema";
import { timeClerk } from "@/lib/perf";
import { deleteOrg, replaceOrg, type OrgSnapshot } from "@/lib/org-store";

/**
 * Clerk → Postgres org mirror (self-hosting phase 2). Server-only. Exists only
 * while Clerk's org UI is the writer; it goes away in phase 4, when EnvHQ's
 * own org pages write `org_members` directly.
 *
 * FETCH-ON-EVENT, NOT APPLY-THE-PAYLOAD. A webhook says "something about org
 * X changed"; `syncOrgFromClerk` then reads org X's *current* state from Clerk
 * and replaces Postgres's copy. Svix doesn't promise delivery order, so
 * applying "member added" and "member removed" as they arrive could leave a
 * removed member in place if they land backwards. Re-reading makes every
 * delivery — late, duplicated, or out of order — converge on what Clerk holds
 * now.
 *
 * Personal orgs are not mirrored: `lib/orgs.ts` creates them in Postgres
 * only. Only team orgs, made on Clerk's `/teams` screen, pass through here.
 */

const PAGE = 100;
const ADMIN_ROLE = "org:admin";

/** Org X as Clerk holds it right now, or null if Clerk no longer has it. */
export async function fetchClerkOrgSnapshot(orgId: string): Promise<OrgSnapshot | null> {
  const client = await clerkClient();
  let org;
  try {
    org = await timeClerk("organizations.getOrganization", () =>
      client.organizations.getOrganization({ organizationId: orgId }),
    );
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }

  // Paginated to the end: Clerk's default page is 10, and a member missing
  // from this list would lose their access when Postgres becomes the source.
  const members: OrgSnapshot["members"] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, totalCount } = await timeClerk("organizations.getOrganizationMembershipList", () =>
      client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: PAGE, offset }),
    );
    for (const m of data) {
      if (!m.publicUserData?.userId) continue;
      members.push({ userId: m.publicUserData.userId, role: m.role === ADMIN_ROLE ? "admin" : "member" });
    }
    if (data.length < PAGE || offset + PAGE >= totalCount) break;
  }

  const [personalRow] = await db
    .select({ userId: personalOrgs.userId })
    .from(personalOrgs)
    .where(eq(personalOrgs.orgId, orgId))
    .limit(1);
  const personal = Boolean(personalRow) || (org.privateMetadata as { personal?: unknown } | null)?.personal === true;

  return { id: org.id, name: org.name, personal, createdByUserId: org.createdBy ?? null, members };
}

/** Makes Postgres match Clerk for one org — replaced if Clerk has it, deleted if not. Idempotent. */
export async function syncOrgFromClerk(orgId: string): Promise<"replaced" | "deleted"> {
  const snapshot = await fetchClerkOrgSnapshot(orgId);
  if (!snapshot) {
    await deleteOrg(orgId);
    return "deleted";
  }
  await replaceOrg(snapshot);
  return "replaced";
}
