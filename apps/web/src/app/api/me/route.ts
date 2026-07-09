import { getUserId } from "@/lib/auth";
import { json, unauthorized } from "@/lib/api";

export const runtime = "nodejs";

// Lightweight whoami — the CLI uses this to validate a token after login.
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  return json({ userId });
}
