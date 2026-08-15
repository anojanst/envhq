import { describe, expect, test } from "vitest";
import {
  json,
  apiError,
  unauthorized,
  tokenExpired,
  forbidden,
  notFound,
  badRequest,
  conflict,
  versionConflict,
} from "./api";

describe("json", () => {
  test("defaults to 200 and echoes the body", async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("accepts an explicit status", async () => {
    const res = json({ created: true }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ created: true });
  });
});

describe("apiError", () => {
  test("wraps the message in an error body at the given status", async () => {
    const res = apiError("nope", 418);
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ error: "nope" });
  });
});

describe("unauthorized", () => {
  test("returns 401 with the generic Unauthorized body", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("tokenExpired", () => {
  test("returns 401 with a body distinct from unauthorized(), so the CLI can key off it", async () => {
    const res = tokenExpired();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "token_expired" });
    expect(body.error).not.toBe("Unauthorized");
  });
});

describe("forbidden", () => {
  test("defaults to 403 with a generic Forbidden body", async () => {
    const res = forbidden();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  test("accepts a custom message", async () => {
    const res = forbidden("not your project");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "not your project" });
  });
});

describe("notFound", () => {
  test("defaults to 404 with a generic Not found body", async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  test("accepts a custom subject", async () => {
    const res = notFound("Environment");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Environment" });
  });
});

describe("badRequest", () => {
  test("returns 400 with the given message", async () => {
    const res = badRequest("missing name");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing name" });
  });
});

describe("conflict", () => {
  test("returns 409 with the given message", async () => {
    const res = conflict("already exists");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already exists" });
  });
});

describe("versionConflict", () => {
  test("returns 409 for a lost compare-and-swap in commitVersion", async () => {
    const res = versionConflict();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This environment changed elsewhere — refresh and try again.",
    });
  });
});
