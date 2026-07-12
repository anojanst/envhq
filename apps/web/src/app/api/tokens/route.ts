import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, projects } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isFullAccess } from "@/lib/access";
import { generateToken, hashToken } from "@/lib/crypto";
import { json, badRequest, unauthorized, tokenExpired, forbidden } from "@/lib/api";

export const runtime = "nodejs";

// List the user's tokens (never returns the secret, only metadata + scope).
export async function GET(req: Request) {
  const { userId, expired } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const rows = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      kind: apiTokens.kind,
      capability: apiTokens.capability,
      projectId: apiTokens.projectId,
      projectName: projects.name,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .leftJoin(projects, eq(apiTokens.projectId, projects.id))
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt));

  return json({ tokens: rows });
}

// Create a scoped PAT. The plaintext is returned exactly once here.
export async function POST(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  // A leaked scoped/read-only PAT must not be able to mint itself a broader one.
  if (!isFullAccess(scope)) return forbidden("This token can't create tokens.");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  const capability = body?.capability === "read" ? "read" : "write";

  const projectId =
    typeof body?.projectId === "string" && body.projectId ? body.projectId : null;
  if (projectId && !(await getAccessibleProject(userId, projectId, "viewer"))) {
    return badRequest("Unknown project");
  }

  const days = Number(body?.expiresInDays);
  const expiresAt =
    Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  const token = generateToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name,
      tokenHash: hashToken(token),
      kind: "pat",
      projectId,
      capability,
      expiresAt,
    })
    .returning({
      id: apiTokens.id,
      name: apiTokens.name,
      capability: apiTokens.capability,
      projectId: apiTokens.projectId,
      expiresAt: apiTokens.expiresAt,
      createdAt: apiTokens.createdAt,
    });

  return json({ token, ...row, expiresAt: row.expiresAt?.toISOString() ?? null }, 201);
}
