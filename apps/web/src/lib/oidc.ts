import * as client from "openid-client";

/**
 * The one way EnvHQ signs people in: OpenID Connect, authorization code flow
 * with PKCE (self-hosting phase 3). Server-only (Node runtime).
 *
 * Which identity provider is configuration, never code:
 *   - envhq.dev: Clerk, acting as an OIDC provider
 *   - a self-hosted install: the customer's own (Okta, Entra ID, Google
 *     Workspace, Keycloak, …)
 *
 *   OIDC_ISSUER                 e.g. https://login.example.com (discovery is read from it)
 *   OIDC_CLIENT_ID
 *   OIDC_CLIENT_SECRET          omit for a public client (PKCE alone)
 *   OIDC_SCOPES                 default "openid email profile"
 *   OIDC_ALLOWED_EMAIL_DOMAINS  optional, comma-separated: only verified emails
 *                               in these domains may sign in
 *   ENVHQ_PUBLIC_URL            the URL people reach EnvHQ at, when that isn't
 *                               the URL the server sees (behind a proxy)
 *
 * The provider answers *who someone is* (`sub`, name, email, picture).
 * Org membership is never read from it — see CLAUDE.md.
 */

export interface OidcSettings {
  issuer: URL;
  clientId: string;
  clientSecret: string | undefined;
  scopes: string;
  allowedEmailDomains: string[];
}

export function oidcSettings(): OidcSettings {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!issuer || !clientId) {
    throw new Error("Sign-in isn't configured: set OIDC_ISSUER and OIDC_CLIENT_ID.");
  }
  return {
    issuer: new URL(issuer),
    clientId,
    clientSecret: process.env.OIDC_CLIENT_SECRET || undefined,
    scopes: process.env.OIDC_SCOPES || "openid email profile",
    allowedEmailDomains: (process.env.OIDC_ALLOWED_EMAIL_DOMAINS ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  };
}

let cached: { key: string; config: Promise<client.Configuration> } | null = null;

/** The provider's discovered configuration — fetched once per process, re-fetched if a previous attempt failed. */
export function oidcConfig(): Promise<client.Configuration> {
  const s = oidcSettings();
  const key = `${s.issuer.href}|${s.clientId}|${s.clientSecret ? "secret" : "public"}`;
  if (cached?.key === key) return cached.config;

  const auth = s.clientSecret ? client.ClientSecretPost(s.clientSecret) : client.None();
  // Plain http only for a provider on this machine (local development and
  // the CI end-to-end test). Anything else must be https.
  const local = s.issuer.protocol === "http:" && ["localhost", "127.0.0.1"].includes(s.issuer.hostname);
  const config = client
    .discovery(s.issuer, s.clientId, undefined, auth, local ? { execute: [client.allowInsecureRequests] } : undefined)
    .catch((err) => {
      cached = null;
      throw err;
    });
  cached = { key, config };
  return config;
}

/** Where people reach EnvHQ — `ENVHQ_PUBLIC_URL`, else the request's own origin. */
export function publicOrigin(requestUrl: string): string {
  return (process.env.ENVHQ_PUBLIC_URL || new URL(requestUrl).origin).replace(/\/$/, "");
}

export function callbackUrl(requestUrl: string): string {
  return `${publicOrigin(requestUrl)}/auth/callback`;
}

export interface SignedInUser {
  userId: string;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
}

/** Why a sign-in was refused — shown on /sign-in as a short code. */
export class SignInRefused extends Error {
  constructor(readonly code: "domain" | "unverified" | "no_subject") {
    super(code);
  }
}

/**
 * Turns an ID token's claims (topped up from userinfo when the provider
 * leaves name or email out of the token) into who signed in, enforcing the
 * email-domain allow-list if one is set.
 */
export function toSignedInUser(
  claims: Record<string, unknown>,
  settings: Pick<OidcSettings, "allowedEmailDomains">,
): SignedInUser {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const userId = str(claims.sub);
  if (!userId) throw new SignInRefused("no_subject");
  const email = str(claims.email);

  if (settings.allowedEmailDomains.length > 0) {
    if (!email) throw new SignInRefused("domain");
    if (claims.email_verified === false) throw new SignInRefused("unverified");
    const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
    if (!settings.allowedEmailDomains.includes(domain)) throw new SignInRefused("domain");
  }

  const fullName = str(claims.name) ?? ([str(claims.given_name), str(claims.family_name)].filter(Boolean).join(" ") || null);
  return {
    userId,
    name: fullName ?? str(claims.preferred_username),
    email,
    imageUrl: str(claims.picture),
  };
}

export { client };
