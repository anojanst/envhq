/**
 * The origin people reach EnvHQ at. Edge-safe (used by `middleware.ts`).
 *
 * `ENVHQ_PUBLIC_URL` when set — required behind a reverse proxy or in the
 * Docker image, where the server sees its own bind address (`0.0.0.0:3000`)
 * rather than the URL in the browser. Otherwise the request's own origin,
 * which is right on Vercel and in local development.
 *
 * Every absolute URL EnvHQ hands a browser — redirects, the OIDC redirect
 * URI, invite links — and the cookies' `Secure` decision go through this.
 */
export function publicOrigin(requestUrl: string): string {
  return (process.env.ENVHQ_PUBLIC_URL || new URL(requestUrl).origin).replace(/\/$/, "");
}

/** An absolute URL on the public origin for `path`. */
export function publicUrl(path: string, requestUrl: string): URL {
  return new URL(path, `${publicOrigin(requestUrl)}/`);
}
