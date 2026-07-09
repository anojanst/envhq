import { serializeEnv } from "@env-sync/parser";
import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment } from "@/lib/access";
import { listPairs } from "@/lib/env-store";
import { json, unauthorized, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Copy-all / CLI pull: return the environment serialized as a .env blob.
export async function GET(req: Request, { params }: Params) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id);
  if (!owned) return notFound("Environment not found");

  const pairs = await listPairs(id);
  return json({ content: serializeEnv(pairs), count: pairs.length });
}
