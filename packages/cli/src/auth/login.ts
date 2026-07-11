import { createPkce } from "./pkce.ts";
import { startLoopback } from "./loopback.ts";
import { openBrowser } from "./browser.ts";

export interface Session {
  token: string;
  expiresAt: string;
  userId: string;
}

/**
 * Run the full loopback + PKCE browser login against `url` and return the minted
 * session. Shared by the `login` command and the auto-relogin interceptor in the
 * API client — the token is exchanged over HTTPS and never appears in a URL.
 */
export async function runLoginFlow(url: string): Promise<Session> {
  const pkce = createPkce();
  const loopback = await startLoopback();
  try {
    const authorizeUrl = new URL("/cli/authorize", url);
    authorizeUrl.searchParams.set("port", String(loopback.port));
    authorizeUrl.searchParams.set("state", pkce.state);
    authorizeUrl.searchParams.set("challenge", pkce.challenge);

    console.log("\nOpening your browser to approve this login…");
    console.log(`If it doesn't open, visit:\n  ${authorizeUrl.toString()}\n`);
    openBrowser(authorizeUrl.toString());

    const { code } = await loopback.waitForCode(pkce.state);

    let res: Response;
    try {
      res = await fetch(`${url}/api/cli/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, verifier: pkce.verifier }),
      });
    } catch {
      throw new Error(`Could not reach ${url} to complete login.`);
    }
    if (!res.ok) throw new Error(`Token exchange failed (${res.status}).`);

    return (await res.json()) as Session;
  } finally {
    loopback.close();
  }
}
