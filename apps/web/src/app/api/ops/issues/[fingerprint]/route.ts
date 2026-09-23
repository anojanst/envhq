import { getUserId } from "@/lib/auth";
import { isStaff, setIssueMuted } from "@/lib/ops-metrics";
import { json, unauthorized, tokenExpired, notFound, badRequest } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ fingerprint: string }> };

/**
 * Mutes or unmutes one issue (RM-18).
 *
 * The ticket's second gotcha is that an alert firing constantly is an alert
 * nobody reads, and the usual cause is a known, accepted failure nobody can
 * silence. Without this the only way to stop one is to stop reading alerts,
 * which takes the real ones with it. Muting is reversible and recorded.
 */
export async function PATCH(req: Request, { params }: Params) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (!isStaff(userId)) return notFound();

  const { fingerprint } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.muted !== "boolean") return badRequest("muted must be a boolean");

  const found = await setIssueMuted(fingerprint, body.muted);
  if (!found) return notFound("Issue not found");
  return json({ ok: true, muted: body.muted });
}
