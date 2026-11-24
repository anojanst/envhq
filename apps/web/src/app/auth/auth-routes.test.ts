import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The sign-in / sign-out pair, with the provider mocked. What's pinned here
 * is the part a provider without a sign-out endpoint (Clerk) depends on:
 * signing out leaves `envhq_signed_out`, the next sign-in turns it into
 * `prompt=login`, and only a successful callback clears it.
 */

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));

let endSession: string | undefined;
let grantFails = false;
vi.mock("@/lib/oidc", () => ({
  oidcSettings: () => ({ scopes: "openid email profile" }),
  oidcConfig: async () => ({
    serverMetadata: () => ({ end_session_endpoint: endSession }),
    clientMetadata: () => ({ client_id: "client_1" }),
  }),
  callbackUrl: () => "https://envhq.example.com/auth/callback",
  client: {
    randomPKCECodeVerifier: () => "verifier",
    randomState: () => "state",
    randomNonce: () => "nonce",
    calculatePKCECodeChallenge: async () => "challenge",
    buildAuthorizationUrl: (_config: unknown, params: Record<string, string>) =>
      new URL(`https://idp.example.com/authorize?${new URLSearchParams(params)}`),
    buildEndSessionUrl: () => new URL("https://idp.example.com/logout"),
    authorizationCodeGrant: async () => {
      if (grantFails) throw new Error("bad code");
      return { access_token: "at", claims: () => ({ sub: "user_1", email: "a@example.com", name: "A" }) };
    },
  },
  toSignedInUser: (claims: { sub: string }) => ({ userId: claims.sub, name: "A", email: "a@example.com", imageUrl: null }),
  SignInRefused: class extends Error {},
}));
vi.mock("@/lib/observability", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/user-profiles", () => ({ upsertUserProfile: vi.fn() }));

const { GET: signIn } = await import("./sign-in/route");
const { POST: signOut } = await import("./sign-out/route");
const { GET: callback } = await import("./callback/route");
const { sealFlow } = await import("@/lib/session");

const ORIGIN = "https://envhq.example.com";

beforeEach(() => {
  jar.clear();
  endSession = undefined;
  grantFails = false;
  process.env.SESSION_SECRET = "x".repeat(40);
  delete process.env.ENVHQ_PUBLIC_URL;
});

describe("sign-out", () => {
  test("clears the session and marks the browser as signed out", async () => {
    const res = await signOut(new Request(`${ORIGIN}/auth/sign-out`, { method: "POST" }));
    expect(res.status).toBe(303);
    expect(res.cookies.get("envhq_session")?.value).toBe("");
    const marker = res.cookies.get("envhq_signed_out");
    expect(marker?.value).toBe("1");
    expect(marker?.httpOnly).toBe(true);
    expect(marker?.secure).toBe(true);
  });

  test("stays on EnvHQ even when the provider has a sign-out endpoint", async () => {
    // Okta refuses it without an id_token_hint, Entra/Keycloak need the URL
    // registered; the fresh-login prompt covers every provider instead.
    endSession = "https://idp.example.com/logout";
    const res = await signOut(new Request(`${ORIGIN}/auth/sign-out`, { method: "POST" }));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(res.cookies.get("envhq_signed_out")?.value).toBe("1");
  });
});

describe("sign-in", () => {
  test("after a sign-out, asks the provider for a fresh login", async () => {
    jar.set("envhq_signed_out", "1");
    const res = await signIn(new Request(`${ORIGIN}/auth/sign-in`));
    expect(new URL(res.headers.get("location")!).searchParams.get("prompt")).toBe("login");
  });

  test("the prompt is configurable — Google offers select_account, not login", async () => {
    jar.set("envhq_signed_out", "1");
    process.env.OIDC_SIGN_OUT_PROMPT = "select_account";
    try {
      const res = await signIn(new Request(`${ORIGIN}/auth/sign-in`));
      expect(new URL(res.headers.get("location")!).searchParams.get("prompt")).toBe("select_account");
    } finally {
      delete process.env.OIDC_SIGN_OUT_PROMPT;
    }
  });

  test("an ordinary sign-in sends no prompt", async () => {
    const res = await signIn(new Request(`${ORIGIN}/auth/sign-in`));
    const target = new URL(res.headers.get("location")!);
    expect(target.origin).toBe("https://idp.example.com");
    expect(target.searchParams.has("prompt")).toBe(false);
  });

  test("starting a sign-in doesn't clear the marker — only a successful callback does", async () => {
    jar.set("envhq_signed_out", "1");
    const res = await signIn(new Request(`${ORIGIN}/auth/sign-in`));
    expect(res.cookies.get("envhq_signed_out")).toBeUndefined();
  });
});

describe("callback", () => {
  async function returnFromProvider(query = "code=abc&state=state") {
    jar.set("envhq_signed_out", "1");
    jar.set("envhq_oidc", await sealFlow({ state: "state", nonce: "nonce", verifier: "verifier", returnTo: "/dashboard" }));
    return callback(new Request(`${ORIGIN}/auth/callback?${query}`));
  }

  test("a successful sign-in clears the signed-out marker", async () => {
    const res = await returnFromProvider();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
    expect(res.cookies.get("envhq_session")?.value).toBeTruthy();
    expect(res.cookies.get("envhq_signed_out")?.value).toBe("");
  });

  test("a failed sign-in keeps it, so the retry still asks for a fresh login", async () => {
    grantFails = true;
    const res = await returnFromProvider();
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(res.cookies.get("envhq_signed_out")).toBeUndefined();
  });

  test("a provider that rejects the prompt doesn't lock people out for 30 days", async () => {
    const res = await returnFromProvider("error=invalid_request&state=state");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(res.cookies.get("envhq_signed_out")?.value).toBe("");
  });

  test("cancelling at the provider keeps the marker", async () => {
    const res = await returnFromProvider("error=access_denied&state=state");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=callback`);
    expect(res.cookies.get("envhq_signed_out")).toBeUndefined();
  });
});
