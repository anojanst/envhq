import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, environments } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { isFullAccess } from "@/lib/access";
import { json, badRequest, unauthorized, tokenExpired, forbidden, conflict } from "@/lib/api";

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = "23505";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();

  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        scope?.projectId ? eq(projects.id, scope.projectId) : undefined,
      ),
    )
    .orderBy(desc(projects.createdAt));

  return json({ projects: rows });
}

export async function POST(req: Request) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (!isFullAccess(scope)) return forbidden("This token can't create projects.");

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  // Default a new project to a single "dev" environment; callers (e.g. the CLI)
  // may pass an explicit list. An empty array opts out entirely.
  const envNames: string[] = Array.isArray(body?.environments)
    ? Array.from(
        new Set(
          (body.environments as unknown[]).map((e) => String(e).trim()).filter(Boolean),
        ),
      )
    : ["dev"];

  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.name, name)))
    .limit(1);
  if (existing.length > 0) return conflict(`A project named "${name}" already exists.`);

  let project;
  try {
    [project] = await db.insert(projects).values({ userId, name }).returning();
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === UNIQUE_VIOLATION) {
      return conflict(`A project named "${name}" already exists.`);
    }
    throw err;
  }

  const createdEnvs =
    envNames.length > 0
      ? await db
          .insert(environments)
          .values(envNames.map((envName) => ({ projectId: project.id, name: envName })))
          .returning()
      : [];

  return json({ project, environments: createdEnvs }, 201);
}
