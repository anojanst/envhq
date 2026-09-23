import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The endpoint an uptime monitor watches (RM-18).
 *
 * Two depths, because the ticket asks for checks on "the app and on a
 * signed-in API route" and those answer different questions:
 *
 *   - **Unauthenticated**: the process is up and can reach the database.
 *     This is what a public monitor polls. It deliberately reveals nothing
 *     beyond up/down — a health endpoint enumerating versions or dependency
 *     hostnames is free reconnaissance.
 *   - **With a bearer token**: additionally exercises the token lookup and
 *     hashing path, so a monitor notices an authentication failure rather
 *     than reporting green while customers are locked out.
 *
 * THE THREE OUTCOMES ARE DELIBERATELY DISTINCT, because collapsing them is
 * how a monitor becomes noise. A token that does not resolve is a **401**:
 * the monitor's own credential has expired or been revoked, which is a
 * misconfiguration on its side and must not page anyone at 3am as an
 * outage. The service being unable to *evaluate* the token — the lookup
 * itself throwing — is a **503**, because that is a real failure of the
 * authentication path. An earlier draft of this route returned 503 for
 * both, which would have turned every token rotation into an incident.
 *
 * Never cached: a cached health check is a health check that lies.
 */
export async function GET(req: Request): Promise<Response> {
  const started = Date.now();

  let database: "ok" | "down" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch {
    database = "down";
  }

  let auth: "ok" | "rejected" | "down" | undefined;
  if (req.headers.get("authorization")?.startsWith("Bearer ")) {
    try {
      // A bearer token never touches Clerk — this is our own table and hash.
      const { userId } = await getUserId(req);
      auth = userId ? "ok" : "rejected";
    } catch {
      auth = "down";
    }
  }

  const body = { ok: false, database, ...(auth ? { auth } : {}), latencyMs: Date.now() - started };

  if (auth === "rejected") {
    return respond({ ...body, ok: false }, 401);
  }
  if (database === "down" || auth === "down") {
    return respond({ ...body, ok: false }, 503);
  }
  return respond({ ...body, ok: true }, 200);
}

function respond(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
