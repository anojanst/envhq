import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { generateToken, hashToken } from "@/lib/crypto";
import { json, badRequest, unauthorized } from "@/lib/api";

export const runtime = "nodejs";

// List the user's tokens (never returns the secret, only metadata).
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));

  return json({ tokens: rows });
}

// Create a token. The plaintext is returned exactly once here.
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  const token = generateToken();
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: hashToken(token) })
    .returning({ id: apiTokens.id, name: apiTokens.name, createdAt: apiTokens.createdAt });

  return json({ token, ...row }, 201);
}
