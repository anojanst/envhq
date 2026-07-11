import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getOwnedProject, isReadOnly } from "@/lib/access";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const project = await getOwnedProject(userId, id, scope);
  if (!project) return notFound("Project not found");

  const envs = await db
    .select()
    .from(environments)
    .where(eq(environments.projectId, id))
    .orderBy(asc(environments.createdAt));

  return json({ project, environments: envs });
}

export async function PATCH(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const project = await getOwnedProject(userId, id, scope);
  if (!project) return notFound("Project not found");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  const [updated] = await db
    .update(projects)
    .set({ name, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();

  return json({ project: updated });
}

export async function DELETE(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const project = await getOwnedProject(userId, id, scope);
  if (!project) return notFound("Project not found");

  await db.delete(projects).where(eq(projects.id, id));
  return json({ ok: true });
}
