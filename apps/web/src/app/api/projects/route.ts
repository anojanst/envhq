import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { json, badRequest, unauthorized } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));

  return json({ projects: rows });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return badRequest("name is required");

  const [project] = await db
    .insert(projects)
    .values({ userId, name })
    .returning();

  return json({ project }, 201);
}
