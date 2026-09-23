import { generateKeypair, sealToPublicKey, encodeBase64 } from "@envhq/crypto";
import { api } from "@/lib/client";

/**
 * Browser-side issuance of a deploy key (RM-11 / ADR-020).
 *
 * Its own module, rather than inline in the dialog, for one reason: the
 * ticket requires "the private key is never sent to the server" to be
 * asserted **against the request payload, not by reading the code**. A
 * function that builds the request is something a test can call with the
 * network stubbed and then inspect what it tried to send. A component that
 * does the same work inline is not. See `deploy-key-client.test.ts`.
 *
 * The keypair never leaves this function except in its return value, which
 * the caller displays once and then drops.
 */

/**
 * The single secret a pipeline stores as `ENVHQ_DEPLOY_KEY`.
 *
 * Both halves, because `unsealWithPrivateKey` binds the recipient's public
 * key into the HKDF and so needs it to open anything. The alternative — ship
 * only the private half and have the API hand back the public one — would
 * make the credential depend on the server telling the truth about which key
 * it is, and would give a pipeline no way to check it holds the key it
 * thinks it holds before making a call.
 *
 * Versioned so a future format change is a readable error rather than a
 * decryption failure.
 */
const SECRET_PREFIX = "envhq_dk_v1";

export function formatDeployKeySecret(publicKey: string, privateKey: string): string {
  return `${SECRET_PREFIX}.${publicKey}.${privateKey}`;
}

export function parseDeployKeySecret(secret: string): { publicKey: string; privateKey: string } {
  const parts = secret.trim().split(".");
  if (parts.length !== 3 || parts[0] !== SECRET_PREFIX) {
    throw new Error("That doesn't look like an EnvHQ deploy key.");
  }
  return { publicKey: parts[1]!, privateKey: parts[2]! };
}

export interface IssueDeployKeyArgs {
  projectId: string;
  label: string;
  /** null = the whole project. An authorization cap, not an isolation boundary. */
  environmentId: string | null;
  /** The project DEK, already unsealed in this session. Sealed to the new public key here. */
  dek: Uint8Array;
}

export interface IssuedDeployKeyResult {
  id: string;
  /** Shown once. Store as ENVHQ_DEPLOY_KEY. */
  deployKeySecret: string;
  /** Shown once. Store as ENVHQ_TOKEN. */
  token: string;
}

/**
 * Generates the keypair, seals the project DEK to its public half, and
 * registers it. Only the public half and the sealed blob are transmitted.
 */
export async function issueDeployKey(args: IssueDeployKeyArgs): Promise<IssuedDeployKeyResult> {
  const keypair = await generateKeypair();
  const wrappedDek = await sealToPublicKey(encodeBase64(args.dek), keypair.publicKey);

  const created = await api<{ id: string; token: string }>(
    `/api/projects/${args.projectId}/deploy-keys`,
    {
      method: "POST",
      body: {
        label: args.label,
        environmentId: args.environmentId,
        publicKey: keypair.publicKey,
        wrappedDek,
      },
    },
  );

  return {
    id: created.id,
    deployKeySecret: formatDeployKeySecret(keypair.publicKey, keypair.privateKey),
    token: created.token,
  };
}
