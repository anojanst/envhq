import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { json, unauthorized, notFound } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Revoke a token.
export async function DELETE(req: Request, { params }: Params) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();
  const { id } = await params;

  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });

  if (deleted.length === 0) return notFound("Token not found");
  return json({ ok: true });
}
