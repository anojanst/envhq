import { getUserId } from "@/lib/auth";
import { collectOpsMetrics, isStaff } from "@/lib/ops-metrics";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";
import { withPerf } from "@/lib/perf";

export const runtime = "nodejs";

/**
 * EnvHQ's own numbers (RM-18). Staff only — see `isStaff` for why that is an
 * environment allowlist rather than a role, and why replacing it belongs to
 * RM-17.
 *
 * A non-staff caller gets 404, not 403, matching `lib/access.ts`'s rule
 * throughout: someone probing for an admin surface learns nothing a stranger
 * wouldn't.
 */
export async function GET(req: Request) {
  return withPerf("api/ops/metrics", async () => {
    const { userId, expired } = await getUserId(req);
    if (expired) return tokenExpired();
    if (!userId) return unauthorized();
    if (!isStaff(userId)) return notFound();

    return json(await collectOpsMetrics());
  });
}
