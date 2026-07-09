import { eq } from "drizzle-orm";
import { db } from "@/db";
import { envVars } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getOwnedVar } from "@/lib/access";
import { encrypt } from "@/lib/crypto";
import { json, badRequest, unauthorized, notFound, conflict } from "@/lib/api";

export const runtime = "nodejs";

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedVar(userId, id);
  if (!owned) return notFound("Variable not found");

  const body = await req.json().catch(() => null);
  const set: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body?.key === "string") {
    const key = body.key.trim();
    if (!KEY_RE.test(key)) return badRequest("Invalid key format");
    set.key = key;
  }
  if (typeof body?.value === "string") {
    const enc = encrypt(body.value);
    set.valueCiphertext = enc.ciphertext;
    set.iv = enc.iv;
    set.authTag = enc.authTag;
  }
  if (Object.keys(set).length === 1) return badRequest("Nothing to update");

  try {
    const [updated] = await db
      .update(envVars)
      .set(set)
      .where(eq(envVars.id, id))
      .returning({ id: envVars.id, key: envVars.key });
    return json({ variable: updated });
  } catch {
    return conflict("A variable with that key already exists in this environment");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getOwnedVar(userId, id);
  if (!owned) return notFound("Variable not found");

  await db.delete(envVars).where(eq(envVars.id, id));
  return json({ ok: true });
}
