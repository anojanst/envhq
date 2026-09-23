import { getUserId } from "@/lib/auth";
import { getAccessibleEnvironment } from "@/lib/access";
import { listPairs } from "@/lib/env-store";
import { resolveDeployKey } from "@/lib/deploy-keys";
import { withPerf } from "@/lib/perf";
import { json, unauthorized, tokenExpired, notFound, forbidden } from "@/lib/api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * The header a CI job presents its deploy key's **public** half in.
 *
 * A header rather than a query parameter: public keys are not secret, but
 * URLs end up in access logs, proxy logs and error reports, and a value that
 * identifies a production pipeline does not belong in all of them.
 */
const DEPLOY_KEY_HEADER = "x-envhq-deploy-key";

/**
 * Copy-all / CLI pull: return the environment's ciphertext pairs. The
 * server can no longer serialize a `.env` blob itself (that requires
 * decrypting) — the caller decrypts each pair with the project DEK and
 * calls `@envhq/parser`'s `serializeEnv` client-side.
 *
 * With `X-EnvHQ-Deploy-Key` set, this is also the pipeline path (RM-11): the
 * response carries the project DEK **sealed to that deploy key** so a CI job
 * with no human and no keychain can decrypt. The two authorizations are
 * separate on purpose — the bearer token says the caller may read this
 * environment, the deploy key says which sealed blob to hand back — and both
 * must pass. A token alone still yields only ciphertext.
 */
export async function GET(req: Request, ctx: Params) {
  return withPerf("api/environments/[id]/export", () => handleGet(req, ctx));
}

async function handleGet(req: Request, { params }: Params) {
  const { userId, expired, scope } = await getUserId(req);
  if (expired) return tokenExpired();
  if (!userId) return unauthorized();
  const { id } = await params;

  const owned = await getAccessibleEnvironment(userId, id, "viewer", scope);
  if (!owned) return notFound("Environment not found");

  const pairs = await listPairs(id);
  const presentedKey = req.headers.get(DEPLOY_KEY_HEADER)?.trim();

  if (!presentedKey) {
    return json({ pairs, count: pairs.length, version: owned.env.version });
  }

  // Scoped to the project the token already authorized, so naming another
  // project's public key here resolves to nothing.
  const resolved = await resolveDeployKey(owned.env.projectId, id, presentedKey);
  if (!resolved.ok) {
    if (resolved.reason === "environment_not_allowed") {
      return forbidden("This deploy key is not allowed to read this environment.");
    }
    // "Unknown" and "revoked" are one answer on purpose: distinguishing them
    // would tell a holder of a revoked key that it was once real here.
    return forbidden("This deploy key is not valid for this project.");
  }

  return json({
    pairs,
    count: pairs.length,
    version: owned.env.version,
    /** The project DEK sealed to the presented deploy key. Only its private half opens this. */
    wrappedDek: resolved.wrappedDek,
    /**
     * Which DEK generation `pairs` and `wrappedDek` belong to. ADR-020 asks
     * for this so a long-running job can tell "the project key rotated
     * mid-job, re-run" apart from a corrupt value — the one rotation window
     * that does not resolve cleanly is a job that unsealed the old DEK and
     * then fetched ciphertext after the cutover.
     */
    keyVersion: resolved.keyVersion,
  });
}
