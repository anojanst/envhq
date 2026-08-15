import { getUserId } from "@/lib/auth";
import { getAccessibleProject, isReadOnly } from "@/lib/access";
import { migrateVarsBatch } from "@/lib/project-keys";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Batch step of a DEK rotation — re-encrypts a chunk of `env_vars` under a
 * new DEK generation. Callable repeatedly (chunked for large projects);
 * doesn't touch `project_keys` or bump `projects.keyVersion` — see
 * `lib/project-keys.ts`'s `migrateVarsBatch`/`finalizeRotation` doc comment.
 */
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id } = await params;

  const owned = await getAccessibleProject(userId, id, "admin", scope);
  if (!owned) return notFound("Project not found");

  const body = await req.json().catch(() => null);
  const targetKeyVersion = Number(body?.targetKeyVersion);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!Number.isInteger(targetKeyVersion) || targetKeyVersion <= 0) {
    return badRequest("targetKeyVersion must be a positive integer");
  }
  if (
    !rows ||
    rows.some(
      (r: unknown) =>
        typeof r !== "object" ||
        r === null ||
        typeof (r as { id?: unknown }).id !== "string" ||
        typeof (r as { ciphertext?: unknown }).ciphertext !== "string" ||
        typeof (r as { iv?: unknown }).iv !== "string",
    )
  ) {
    return badRequest("rows must be an array of {id, ciphertext, iv}");
  }

  await migrateVarsBatch(id, targetKeyVersion, rows);

  return json({ ok: true, migrated: rows.length });
}
