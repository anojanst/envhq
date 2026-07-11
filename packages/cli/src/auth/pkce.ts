import crypto from "node:crypto";

export interface Pkce {
  /** High-entropy secret kept in the CLI; proves ownership at token exchange. */
  verifier: string;
  /** S256 hash of the verifier, sent up front in the authorize URL. */
  challenge: string;
  /** Anti-CSRF value echoed back through the loopback redirect. */
  state: string;
}

/** Create an RFC 7636 (S256) PKCE pair plus a random state value. */
export function createPkce(): Pkce {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}
