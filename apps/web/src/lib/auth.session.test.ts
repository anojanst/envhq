import { beforeEach, expect, test } from "vitest";
import { getUserId } from "./auth";
import { SESSION_COOKIE, sealSession } from "./session";

beforeEach(() => {
  process.env.SESSION_SECRET = "z".repeat(40);
});

const withCookie = (cookie: string) => new Request("http://test.local/api/me", { headers: { cookie } });

test("a valid session cookie authenticates an API request", async () => {
  const token = await sealSession("user_web");
  expect(await getUserId(withCookie(`theme=dark; ${SESSION_COOKIE}=${token}; other=1`))).toEqual({ userId: "user_web" });
});

test("a forged or missing session cookie doesn't", async () => {
  expect(await getUserId(withCookie(`${SESSION_COOKIE}=not-a-real-token`))).toEqual({ userId: null });
  expect(await getUserId(new Request("http://test.local/api/me"))).toEqual({ userId: null });
});
