import { getUserId } from "@/lib/auth";
import { mintAuthCode } from "@/lib/cli-auth";
import { json, unauthorized, tokenExpired, badRequest } from "@/lib/api";

export const runtime = "nodejs";

// Called by the /cli/authorize approve page (Clerk session) when the user
// approves a CLI login. Mints a one-time code the browser hands back to the
// CLI's loopback listener.
export async function POST(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const state = typeof body?.state === "string" ? body.state : "";
  const codeChallenge = typeof body?.codeChallenge === "string" ? body.codeChallenge : "";
  const redirectPort = Number(body?.port);
  if (!state || !codeChallenge) return badRequest("state and codeChallenge are required");
  if (!Number.isInteger(redirectPort) || redirectPort < 1 || redirectPort > 65535) {
    return badRequest("port must be a valid loopback port");
  }

  const { code } = await mintAuthCode({ userId, state, codeChallenge, redirectPort });
  return json({ code });
}
