import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { isFullAccess } from "@/lib/access";
import { json, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Revoke a token.
export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  // A leaked scoped/read-only PAT must not be able to revoke other tokens
  // (including more powerful ones) on the account.
  if (!isFullAccess(scope)) return forbidden("This token can't manage tokens.");
  const { id } = await params;

  const deleted = await db
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
    .returning({ id: apiTokens.id });

  if (deleted.length === 0) return notFound("Token not found");
  return json({ ok: true });
}
