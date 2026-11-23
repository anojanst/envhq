import { getUserId } from "@/lib/auth";
import { isFullAccess } from "@/lib/access";
import { getOrgRole } from "@/lib/orgs";
import { OrgRuleError } from "@/lib/org-admin";
import type { OrgRole } from "@/lib/org-store";
import { apiError, forbidden, notFound, tokenExpired, unauthorized } from "@/lib/api";

/**
 * The gate every `api/orgs/[id]/…` handler starts with. Server-only.
 *
 *   - not signed in → 401 (`token_expired` for an expired CLI token)
 *   - not a member of the org → 404, so a stranger can't confirm a team exists
 *   - `admin: true` and only a member → 403
 *   - `write: true` and a project-scoped or read-only token → 403: managing a
 *     team is an account-level action, like creating projects or tokens
 */
export async function orgGate(
  req: Request,
  orgId: string,
  opts: { admin?: boolean; write?: boolean } = {},
): Promise<{ userId: string; role: OrgRole } | Response> {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (opts.write && !isFullAccess(scope)) return forbidden("This token can't manage teams.");
  const role = await getOrgRole(userId, orgId);
  if (!role) return notFound("Team not found");
  if (opts.admin && role !== "admin") return forbidden("Only a team admin can do that.");
  return { userId, role };
}

/** An `OrgRuleError` becomes its status and message; anything else is rethrown. */
export function orgRuleResponse(err: unknown): Response {
  if (err instanceof OrgRuleError) return apiError(err.message, err.status);
  throw err;
}

/** Parses a JSON body, or `{}` for a missing or malformed one — the handlers validate fields themselves. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
