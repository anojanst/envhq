import { EncryptJWT, jwtDecrypt } from "jose";
import { publicOrigin } from "./public-url";

/**
 * EnvHQ's own browser session (self-hosting phase 3). Edge-safe — no Node
 * APIs — because `middleware.ts` reads it on every page request.
 *
 * After the identity provider signs someone in, EnvHQ issues this cookie and
 * never asks the provider again until it expires: the provider's tokens are
 * not stored anywhere. The cookie is an encrypted JWT (`dir` + A256GCM, key
 * derived from `SESSION_SECRET`), so its contents can't be read or forged
 * without the secret. It carries only the user id — the OIDC `sub`.
 *
 * Three cookies, all HTTP-only, `SameSite=Lax`, `Secure` outside localhost:
 *   - `envhq_session` — who you are, for `SESSION_TTL`.
 *   - `envhq_oidc` — a sign-in in flight (state, nonce, PKCE verifier,
 *     where to return), for 10 minutes. Cleared on callback.
 *   - `envhq_signed_out` — this browser signed out and hasn't signed in
 *     since. Carries no identity; see `signInPrompt`.
 */

export const SESSION_COOKIE = "envhq_session";
export const FLOW_COOKIE = "envhq_oidc";
export const SIGNED_OUT_COOKIE = "envhq_signed_out";

/** How long a sign-in lasts. */
export const SESSION_TTL_S = 7 * 24 * 60 * 60;
/** Re-issue the cookie once it's this old, so active users aren't signed out mid-week. */
export const SESSION_REFRESH_AFTER_S = 24 * 60 * 60;
export const FLOW_TTL_S = 10 * 60;
/** How long a sign-out keeps forcing a fresh login. Longer than any provider session worth worrying about. */
export const SIGNED_OUT_TTL_S = 30 * 24 * 60 * 60;

/**
 * The OIDC `prompt` for the next sign-in. After a sign-out it is `"login"`,
 * so the provider asks for credentials even if its own session is still
 * alive. Not every provider has a sign-out endpoint we can send people
 * through (Clerk doesn't); without this, "Sign out" followed by "Continue"
 * would sign the same person straight back in, which on a shared machine
 * means the next person at the keyboard. A normal sign-in, such as after the
 * session expired, sends no prompt and stays password-free while the
 * provider still knows them.
 */
export function signInPrompt(signedOutCookie: string | undefined): "login" | undefined {
  return signedOutCookie ? "login" : undefined;
}

let cachedKey: { secret: string; key: Uint8Array } | null = null;

async function key(): Promise<Uint8Array> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 random characters.");
  }
  if (cachedKey?.secret === secret) return cachedKey.key;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  cachedKey = { secret, key: digest };
  return digest;
}

async function seal(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .encrypt(await key());
}

async function open<T>(token: string | undefined): Promise<(T & { iat: number }) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await key());
    return payload as T & { iat: number };
  } catch {
    // Expired, tampered with, or sealed under an old secret: no session.
    return null;
  }
}

export interface Session {
  userId: string;
  /** Seconds since epoch when this cookie was issued. */
  iat: number;
}

export async function sealSession(userId: string): Promise<string> {
  return seal({ sub: userId }, SESSION_TTL_S);
}

export async function openSession(token: string | undefined): Promise<Session | null> {
  const payload = await open<{ sub?: unknown }>(token);
  if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
  return { userId: payload.sub, iat: payload.iat };
}

export interface SignInFlow {
  state: string;
  nonce: string;
  verifier: string;
  /** A same-origin path to land on afterwards. */
  returnTo: string;
}

export async function sealFlow(flow: SignInFlow): Promise<string> {
  return seal({ ...flow }, FLOW_TTL_S);
}

export async function openFlow(token: string | undefined): Promise<SignInFlow | null> {
  const p = await open<Partial<SignInFlow>>(token);
  if (!p || typeof p.state !== "string" || typeof p.nonce !== "string" || typeof p.verifier !== "string") return null;
  return { state: p.state, nonce: p.nonce, verifier: p.verifier, returnTo: safeReturnTo(p.returnTo) };
}

/**
 * Only a same-origin path may be a post-sign-in destination — never a URL
 * that could send someone to another site with a fresh session (open
 * redirect). Anything else falls back to the dashboard.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/dashboard";
  }
  if (raw.startsWith("/auth/") || raw.startsWith("/sign-in")) return "/dashboard";
  return raw;
}

/** Cookie attributes shared by both cookies. `Secure` everywhere except plain-http localhost. */
export function cookieOptions(requestUrl: string, maxAge: number) {
  const url = new URL(publicOrigin(requestUrl));
  const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  return { httpOnly: true, sameSite: "lax" as const, secure: !local, path: "/", maxAge };
}
