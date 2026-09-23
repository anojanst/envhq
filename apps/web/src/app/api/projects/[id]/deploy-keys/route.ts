import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly } from "@/lib/access";
import { createDeployKey, listDeployKeys } from "@/lib/deploy-keys";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";
import { isUniqueViolation } from "@/lib/db-errors";
import { withPerf } from "@/lib/perf";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Every deploy key on the project, revoked ones included — they are the audit trail. */
export async function GET(req: Request, ctx: Params) {
  return withPerf("api/projects/[id]/deploy-keys", () => handleGet(req, ctx));
}

async function handleGet(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  // Admin-only: a deploy key is a standing credential for the whole project,
  // so seeing the inventory is an administrative question, not a read one.
  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const keys = await listDeployKeys(id);
  return json({
    deployKeys: keys.map((k) => ({
      ...k,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
    })),
  });
}

/**
 * Issues a deploy key (RM-11 / ADR-020).
 *
 * The body carries a **public** key and a DEK already sealed to it, both
 * produced by the caller's browser. There is deliberately no field for the
 * private half: the server does not receive it, cannot store it, and cannot
 * show it again. `deploy-keys.contract.test.ts` asserts that against the
 * request payload rather than by reading this code, which is what the
 * ticket asks for — a comment promising it is not evidence.
 *
 * The token comes back in the clear exactly once, here, alongside the
 * instruction to store both. It is never retrievable afterwards.
 */
export async function POST(req: Request, ctx: Params) {
  return withPerf("api/projects/[id]/deploy-keys", () => handlePost(req, ctx));
}

async function handlePost(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const publicKey = typeof body?.publicKey === "string" ? body.publicKey.trim() : "";
  const wrappedDek = typeof body?.wrappedDek === "string" ? body.wrappedDek : "";
  const environmentId =
    typeof body?.environmentId === "string" && body.environmentId ? body.environmentId : null;

  if (!label) return badRequest("label is required");
  if (!publicKey) return badRequest("publicKey is required");
  if (!wrappedDek) return badRequest("wrappedDek is required");

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  if (environmentId) {
    // Scoping to an environment of *another* project would produce a cap
    // that never matches, i.e. a key that silently works nowhere.
    const [env] = await db
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.id, environmentId), eq(environments.projectId, id)))
      .limit(1);
    if (!env) return badRequest("That environment doesn't belong to this project");
  }

  try {
    const issued = await createDeployKey({
      projectId: id,
      environmentId,
      label,
      publicKey,
      wrappedDek,
      createdByUserId: userId,
    });
    return json(
      {
        id: issued.deployKey.id,
        label: issued.deployKey.label,
        environmentId: issued.deployKey.environmentId,
        publicKey: issued.deployKey.publicKey,
        createdAt: issued.deployKey.createdAt.toISOString(),
        /** Shown once. EnvHQ keeps only a SHA-256 hash and cannot return this again. */
        token: issued.token,
      },
      201,
    );
  } catch (err) {
    if (isUniqueViolation(err)) return badRequest("That public key is already registered on this project");
    throw err;
  }
}
