/**
 * The pipeline credential (RM-11 / ADR-020, see docs/DEPLOY_KEYS.md).
 *
 * A CI job holds two secrets: `ENVHQ_TOKEN` authenticates the fetch and
 * `ENVHQ_DEPLOY_KEY` decrypts what comes back. This module only reads the
 * second one — it never leaves this process except as its public half, which
 * the export route uses to pick which sealed DEK to hand back.
 *
 * The format mirrors `apps/web/src/lib/deploy-key-client.ts`, which mints it.
 * It is duplicated rather than shared because the web app is not a dependency
 * of the published CLI; `deploy-key.test.ts` pins the two together.
 */
const SECRET_PREFIX = "envhq_dk_v2";

export interface DeployKeypair {
  publicKey: string;
  privateKey: string;
}

export function parseDeployKeySecret(secret: string): DeployKeypair {
  const parts = secret.trim().split(".");
  if (parts[0] === "envhq_dk_v1") {
    throw new Error(
      "ENVHQ_DEPLOY_KEY is an older deploy key that EnvHQ's current encryption can't use. " + REISSUE_HINT,
    );
  }
  if (parts.length !== 3 || parts[0] !== SECRET_PREFIX || !parts[1] || !parts[2]) {
    throw new Error(
      "ENVHQ_DEPLOY_KEY doesn't look like an EnvHQ deploy key (expected `envhq_dk_v2.…`). " +
        "Copy it again from the dialog shown when the key was issued, or issue a new one.",
    );
  }
  return { publicKey: parts[1], privateKey: parts[2] };
}

/** The deploy keypair from `ENVHQ_DEPLOY_KEY`, or null when this isn't a pipeline run. */
export function deployKeyFromEnv(): DeployKeypair | null {
  const raw = process.env.ENVHQ_DEPLOY_KEY?.trim();
  return raw ? parseDeployKeySecret(raw) : null;
}

/** What every deploy-key auth failure tells the person reading the job log to do. */
export const REISSUE_HINT =
  "Issue a new deploy key in the EnvHQ web app (project → Deploy keys) and update both " +
  "ENVHQ_TOKEN and ENVHQ_DEPLOY_KEY in your CI secrets.";
