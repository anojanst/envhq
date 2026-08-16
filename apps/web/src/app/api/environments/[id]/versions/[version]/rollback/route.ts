import { getUserId } from "@/lib/auth";
import { getAccessibleEnvironment, isReadOnly } from "@/lib/access";
import { commitVersion, getVersionSnapshot, restoreSnapshot } from "@/lib/version-store";
import { json, badRequest, unauthorized, tokenExpired, notFound, forbidden, conflict } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; version: string }> };

/**
 * Roll back to a historical version — implemented as a *new* version that
 * restores the target snapshot (like `git revert`, not `git reset`), so
 * history stays linear/append-only and reuses the same CAS+snapshot path as
 * a normal commit.
 */
export async function POST(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  if (isReadOnly(scope)) return forbidden("This token is read-only.");
  const { id, version: versionParam } = await params;

  const owned = await getAccessibleEnvironment(userId, id, "editor", scope);
  if (!owned) return notFound("Environment not found");

  const targetVersion = Number(versionParam);
  if (!Number.isInteger(targetVersion) || targetVersion < 0) return badRequest("Invalid version");

  const body = await req.json().catch(() => null);
  const baseVersion = typeof body?.baseVersion === "number" ? body.baseVersion : null;
  if (baseVersion === null) return badRequest("baseVersion is required");
  const message = typeof body?.message === "string" ? body.message : null;

  const versionSnapshot = await getVersionSnapshot(id, targetVersion);
  if (!versionSnapshot) return notFound(`Version ${targetVersion} not found`);
  if (versionSnapshot.keyVersion < owned.project.keyVersion) {
    return conflict(
      "This version predates a key rotation and can no longer be restored — its values are encrypted under a retired key.",
    );
  }

  const outcome = await commitVersion(
    id,
    baseVersion,
    userId,
    message ?? `Rollback to v${targetVersion}`,
    () => restoreSnapshot(id, versionSnapshot.snapshot),
  );

  if (outcome.conflict) {
    // Whole-environment conflict, not a specific key collision — nothing
    // narrower to report than the current version.
    return json({ error: "version_conflict", code: "version_conflict", currentVersion: outcome.currentVersion }, 409);
  }

  return json({ version: outcome.version });
}
