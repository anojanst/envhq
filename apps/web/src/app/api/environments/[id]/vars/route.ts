import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment, isReadOnly } from "@/lib/access";
import { upsertPair } from "@/lib/env-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Params = { params: Promise<{ id: string }> };

// Create or update a single key/value pair.
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
  if (!owned) return notFound("Environment not found");

  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const value = typeof body?.value === "string" ? body.value : "";
  if (!key) return badRequest("key is required");
  if (!KEY_RE.test(key)) {
    return badRequest("key must start with a letter or _ and contain only letters, digits, _");
  }

  const { created } = await upsertPair(id, key, value);
  return json({ key, created }, created ? 201 : 200);
}
