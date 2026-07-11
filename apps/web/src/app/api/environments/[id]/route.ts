import { eq } from "drizzle-orm";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getOwnedEnvironment, isReadOnly } from "@/lib/access";
import { listVarRows } from "@/lib/env-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, conflict, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
  if (!owned) return notFound("Environment not found");

  const vars = await listVarRows(id);
  return json({ environment: owned.env, project: owned.project, vars });
}

export async function PATCH(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
  if (!owned) return notFound("Environment not found");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  try {
    const [updated] = await db
      .update(environments)
      .set({ name, updatedAt: new Date() })
      .where(eq(environments.id, id))
      .returning();
    return json({ environment: updated });
  } catch {
    return conflict(`An environment named "${name}" already exists in this project`);
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getOwnedEnvironment(userId, id, scope);
  if (!owned) return notFound("Environment not found");

  await db.delete(environments).where(eq(environments.id, id));
  return json({ ok: true });
}
