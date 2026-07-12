import { and, eq } from "drizzle-orm";
import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly } from "@/lib/access";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { cloneVars } from "@/lib/env-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, conflict, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id: projectId } = await params;

  const owned = await getAccessibleProject(userId, projectId, "editor", scope);
  if (!owned) return notFound("Project not found");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  // Optional clone source: another environment in the same project. Its
  // ciphertext is copied directly into the new environment.
  const fromId = typeof body?.from === "string" ? body.from : undefined;
  if (fromId) {
    const [source] = await db
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.id, fromId), eq(environments.projectId, projectId)));
    if (!source) return badRequest("Source environment not found in this project");
  }

  let environment;
  try {
    [environment] = await db.insert(environments).values({ projectId, name }).returning();
  } catch {
    return conflict(`An environment named "${name}" already exists in this project`);
  }

  if (fromId) await cloneVars(fromId, environment.id);

  return json({ environment }, 201);
}
