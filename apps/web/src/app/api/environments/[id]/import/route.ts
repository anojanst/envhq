import { parseEnv } from "@env-sync/parser";
import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment } from "@/lib/access";
import { upsertMany } from "@/lib/env-store";
import { json, badRequest, unauthorized, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Paste-a-blob / CLI push: parse a .env blob and upsert-merge it.
export async function POST(req: Request, { params }: Params) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id);
  if (!owned) return notFound("Environment not found");

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : null;
  if (content === null) return badRequest("content is required");

  const pairs = parseEnv(content);
  if (pairs.length === 0) {
    return badRequest("No valid KEY=value lines found in the pasted content");
  }

  const result = await upsertMany(id, pairs);
  return json({ ...result, total: pairs.length });
}
