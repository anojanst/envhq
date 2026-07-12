import { parseEnv } from "@envhq/parser";
import { getUserId } from "@/lib/auth";
import { getAccessibleEnvironment, isReadOnly } from "@/lib/access";
import { upsertMany } from "@/lib/env-store";
import { commitVersion } from "@/lib/version-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden, versionConflict } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Paste-a-blob (web UI): parse a .env blob and upsert-merge it.
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getAccessibleEnvironment(userId, id, "editor", scope);
  if (!owned) return notFound("Environment not found");

  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : null;
  if (content === null) return badRequest("content is required");

  const pairs = parseEnv(content);
  if (pairs.length === 0) {
    return badRequest("No valid KEY=value lines found in the pasted content");
  }

  const outcome = await commitVersion(
    id,
    owned.env.version,
    userId,
    `Pasted ${pairs.length} variable(s) via web`,
    () => upsertMany(id, pairs),
  );
  if (outcome.conflict) return versionConflict();

  return json({ ...outcome.result, total: pairs.length });
}
