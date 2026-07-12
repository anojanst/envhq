import { serializeEnv } from "@envhq/parser";
import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment } from "@/lib/access";
import { listPairs } from "@/lib/env-store";
import { json, unauthorized, tokenExpired, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Copy-all / CLI pull: return the environment serialized as a .env blob.
export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
  if (!owned) return notFound("Environment not found");

  const pairs = await listPairs(id);
  return json({ content: serializeEnv(pairs), count: pairs.length });
}
