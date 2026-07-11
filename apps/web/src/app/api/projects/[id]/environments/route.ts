import { getUserId } from "@/lib/auth";
import { getOwnedProject, isReadOnly } from "@/lib/access";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { json, badRequest, unauthorized, tokenExpired, notFound, conflict, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id: projectId } = await params;

  const project = await getOwnedProject(userId, projectId, scope);
  if (!project) return notFound("Project not found");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  try {
    const [environment] = await db
      .insert(environments)
      .values({ projectId, name })
      .returning();
    return json({ environment }, 201);
  } catch {
    return conflict(`An environment named "${name}" already exists in this project`);
  }
}
