import crypto from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens, cliAuthRequests } from "@/db/schema";
import { generateToken, hashToken } from "./crypto";

/**
 * Server side of the CLI browser-login (PKCE loopback) flow.
 *
 *   1. `mintAuthCode` — the signed-in user approves the login in the browser; we
 *      create a single-use code bound to the CLI's PKCE challenge + the user.
 *   2. `exchangeCode` — the CLI POSTs `code + verifier`; we verify the PKCE
 *      challenge, consume the code once, and mint a 7-day session token.
 *
 * Only hashes are stored; the plaintext code lives just long enough to bounce
 * through the loopback redirect, and is useless without the verifier that never
 * leaves the CLI.
 */

const CODE_TTL_MS = 10 * 60 * 1000; // one-time code: 10 minutes
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // CLI session token: 7 days

/** RFC 7636 S256: the verifier hashes to the challenge the CLI sent up front. */
function pkceChallengeFor(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function mintAuthCode(params: {
  userId: string;
  state: string;
  codeChallenge: string;
  redirectPort: number;
}): Promise<{ code: string }> {
  const code = generateToken();
  await db.insert(cliAuthRequests).values({
    codeHash: hashToken(code),
    codeChallenge: params.codeChallenge,
    state: params.state,
    userId: params.userId,
    redirectPort: params.redirectPort,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return { code };
}

export interface ExchangeResult {
  token: string;
  expiresAt: Date;
  userId: string;
}

export async function exchangeCode(params: {
  code: string;
  verifier: string;
}): Promise<ExchangeResult | { error: string }> {
  const rows = await db
    .select()
    .from(cliAuthRequests)
    .where(eq(cliAuthRequests.codeHash, hashToken(params.code)))
    .limit(1);
  const record = rows[0];
  if (!record) return { error: "invalid_code" };
  if (record.consumedAt) return { error: "code_consumed" };
  if (record.expiresAt.getTime() <= Date.now()) return { error: "code_expired" };
  if (pkceChallengeFor(params.verifier) !== record.codeChallenge) {
    return { error: "pkce_mismatch" };
  }

  // Consume atomically — only the first exchange for a still-unconsumed code
  // wins, so a replayed code can't mint a second token.
  const consumed = await db
    .update(cliAuthRequests)
    .set({ consumedAt: new Date() })
    .where(and(eq(cliAuthRequests.id, record.id), isNull(cliAuthRequests.consumedAt)))
    .returning({ id: cliAuthRequests.id });
  if (consumed.length === 0) return { error: "code_consumed" };

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(apiTokens).values({
    userId: record.userId,
    name: "CLI session",
    tokenHash: hashToken(token),
    kind: "cli_session",
    expiresAt,
  });
  return { token, expiresAt, userId: record.userId };
}
