import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { EncryptJWT } from "jose";
import { cookieOptions, openFlow, openSession, safeReturnTo, sealFlow, sealSession, signInPrompt } from "./session";

const SECRET = "x".repeat(40);

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("session cookie", () => {
  test("round-trips the user id", async () => {
    const token = await sealSession("user_1");
    expect((await openSession(token))?.userId).toBe("user_1");
  });

  test("the cookie is encrypted — the user id isn't readable in it", async () => {
    const token = await sealSession("user_visible_marker");
    expect(token).not.toContain("user_visible_marker");
    expect(Buffer.from(token.split(".")[3] ?? "", "base64url").toString()).not.toContain("user_visible_marker");
  });

  test("a tampered cookie is no session", async () => {
    const token = await sealSession("user_1");
    const parts = token.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "BB" : "AA");
    expect(await openSession(parts.join("."))).toBeNull();
  });

  test("a cookie sealed under another secret is no session", async () => {
    const token = await sealSession("user_1");
    process.env.SESSION_SECRET = "y".repeat(40);
    expect(await openSession(token)).toBeNull();
  });

  test("an expired cookie is no session", async () => {
    const token = await sealSession("user_1");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await openSession(token)).toBeNull();
  });

  test("a sign-in-flow cookie can't be used as a session", async () => {
    const flow = await sealFlow({ state: "s", nonce: "n", verifier: "v", returnTo: "/teams" });
    expect(await openSession(flow)).toBeNull();
  });

  test("a cookie without a subject is no session", async () => {
    const key = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SECRET)));
    const token = await new EncryptJWT({}).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setExpirationTime("1h").encrypt(key);
    expect(await openSession(token)).toBeNull();
  });

  test("a missing or short SESSION_SECRET fails loudly", async () => {
    process.env.SESSION_SECRET = "short";
    await expect(sealSession("user_1")).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("sign-in flow cookie", () => {
  test("round-trips, and re-checks where it returns to", async () => {
    const flow = await openFlow(await sealFlow({ state: "s", nonce: "n", verifier: "v", returnTo: "https://evil.example" }));
    expect(flow).toEqual({ state: "s", nonce: "n", verifier: "v", returnTo: "/dashboard" });
  });
});

describe("safeReturnTo — no open redirects", () => {
  test.each([
    ["/teams?org=org_1", "/teams?org=org_1"],
    ["/cli/authorize?port=1&state=a&challenge=b", "/cli/authorize?port=1&state=a&challenge=b"],
    ["https://evil.example", "/dashboard"],
    ["//evil.example", "/dashboard"],
    ["/\\evil.example", "/dashboard"],
    ["/auth/callback", "/dashboard"],
    ["/sign-in", "/dashboard"],
    [undefined, "/dashboard"],
    [42, "/dashboard"],
  ])("%s → %s", (input, expected) => {
    expect(safeReturnTo(input)).toBe(expected);
  });
});

describe("cookie attributes", () => {
  test("HTTP-only and SameSite=Lax always; Secure except on plain-http localhost", () => {
    expect(cookieOptions("https://envhq.dev/x", 60)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true });
    expect(cookieOptions("http://envhq.corp.internal/x", 60).secure).toBe(true);
    expect(cookieOptions("http://localhost:3000/x", 60).secure).toBe(false);
  });
});

describe("behind a proxy or in the Docker image", () => {
  afterEach(() => {
    delete process.env.ENVHQ_PUBLIC_URL;
  });

  test("redirects and cookies follow ENVHQ_PUBLIC_URL, not the server's bind address", async () => {
    const { publicUrl } = await import("./public-url");
    process.env.ENVHQ_PUBLIC_URL = "https://envhq.corp.example/";
    expect(publicUrl("/teams", "http://0.0.0.0:3000/auth/callback").toString()).toBe("https://envhq.corp.example/teams");
    expect(cookieOptions("http://0.0.0.0:3000/auth/callback", 60).secure).toBe(true);
  });

  test("without it, the request's own origin is used", async () => {
    const { publicUrl } = await import("./public-url");
    expect(publicUrl("/teams", "http://localhost:3000/x").toString()).toBe("http://localhost:3000/teams");
  });
});

describe("signInPrompt — a sign-out forces a fresh login", () => {
  test("after a sign-out the provider is asked to log the person in again", () => {
    expect(signInPrompt("1")).toBe("login");
  });

  test("an ordinary sign-in sends no prompt", () => {
    expect(signInPrompt(undefined)).toBeUndefined();
    expect(signInPrompt("")).toBeUndefined();
  });
});
