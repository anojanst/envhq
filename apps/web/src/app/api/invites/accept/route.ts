import { getUserId } from "@/lib/auth";
import { isFullAccess } from "@/lib/access";
import { acceptInvite } from "@/lib/org-admin";
import { orgRuleResponse, readJson } from "@/lib/org-routes";
import { json, unauthorized, tokenExpired, forbidden, badRequest } from "@/lib/api";

export const runtime = "nodejs";

// Join a team with an invite link's token. Single use.
export async function POST(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (!isFullAccess(scope)) return forbidden("This token can't manage teams.");
  const { token } = await readJson(req);
  if (typeof token !== "string" || !token) return badRequest("token is required");
  try {
    return json(await acceptInvite(token, userId));
  } catch (err) {
    return orgRuleResponse(err);
  }
}
