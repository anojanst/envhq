import { getUserId } from "@/lib/auth";
import { json, unauthorized, tokenExpired } from "@/lib/api";

export const runtime = "nodejs";

// Lightweight whoami — the CLI uses this to validate a token after login.
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  return json({ userId });
}
