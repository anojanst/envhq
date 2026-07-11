import { exchangeCode } from "@/lib/cli-auth";
import { json, badRequest, apiError } from "@/lib/api";

export const runtime = "nodejs";

// Public (no session): the CLI exchanges its one-time code + PKCE verifier for a
// 7-day token. Security comes from the code being single-use and bound to the
// verifier, which never left the CLI — so this route needs no cookie/bearer auth.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const verifier = typeof body?.verifier === "string" ? body.verifier : "";
  if (!code || !verifier) return badRequest("code and verifier are required");

  const result = await exchangeCode({ code, verifier });
  // Collapse every failure reason into one opaque error so the response can't be
  // used as an oracle for which check (code vs. PKCE) failed.
  if ("error" in result) return apiError("invalid_grant", 400);

  return json({
    token: result.token,
    expiresAt: result.expiresAt.toISOString(),
    userId: result.userId,
  });
}
