import { describe, expect, test } from "vitest";
import { isRole, parseEnvScope, isReadOnly, isFullAccess } from "./access";
import type { TokenScope } from "./auth";

describe("isRole", () => {
  test.each(["viewer", "editor", "admin"])("%s is a valid role", (value) => {
    expect(isRole(value)).toBe(true);
  });

  test.each(["owner", "Admin", "", "viewer ", "root"])("%j is not a valid role", (value) => {
    expect(isRole(value)).toBe(false);
  });
});

describe("parseEnvScope", () => {
  test("null input returns null", () => {
    expect(parseEnvScope(null)).toBeNull();
  });

  test("empty string returns null", () => {
    expect(parseEnvScope("")).toBeNull();
  });

  test("valid JSON object is parsed as-is", () => {
    expect(parseEnvScope('{"prod":"viewer"}')).toEqual({ prod: "viewer" });
  });

  test("malformed JSON (unparseable) returns null, not a thrown error", () => {
    expect(parseEnvScope("not-json")).toBeNull();
  });

  test("a JSON literal null returns null", () => {
    expect(parseEnvScope("null")).toBeNull();
  });

  test("a JSON number returns null (not an object)", () => {
    expect(parseEnvScope("5")).toBeNull();
  });

  test("a JSON string returns null (not an object)", () => {
    expect(parseEnvScope('"hello"')).toBeNull();
  });

  test("a JSON array passes the typeof \"object\" check (arrays are objects in JS) and is returned as-is", () => {
    // Documents actual current behavior, not a recommendation: `capRoleForEnv`
    // then does `envScope[envName]` on this value, which is `undefined` for
    // any string key on a plain array, so it behaves the same as an uncapped
    // grant in practice — never an escalation, just an unintended pass-through.
    expect(parseEnvScope("[]")).toEqual([]);
  });
});

describe("isReadOnly / isFullAccess — read-only vs full-access token scope on mutating paths", () => {
  const webSession: TokenScope | undefined = undefined;
  const unscopedWritePat: TokenScope = { projectId: null, capability: "write" };
  const unscopedReadOnlyPat: TokenScope = { projectId: null, capability: "read" };
  const projectScopedWritePat: TokenScope = { projectId: "proj-1", capability: "write" };
  const projectScopedReadOnlyPat: TokenScope = { projectId: "proj-1", capability: "read" };

  test.each([
    ["a web session (no token)", webSession, false, true],
    ["an unscoped, full read/write PAT", unscopedWritePat, false, true],
    ["an unscoped read-only PAT", unscopedReadOnlyPat, true, false],
    // Read: even though this token can write, it's still project-scoped, so
    // it must not be treated as full access — a leaked project-scoped PAT
    // can't be used to mint new tokens or reach account-level actions.
    ["a project-scoped write PAT (can mutate its project, but is not full access)", projectScopedWritePat, false, false],
    ["a project-scoped read-only PAT", projectScopedReadOnlyPat, true, false],
  ])("%s: isReadOnly=%s, isFullAccess=%s", (_label, scope, expectedReadOnly, expectedFullAccess) => {
    expect(isReadOnly(scope)).toBe(expectedReadOnly);
    expect(isFullAccess(scope)).toBe(expectedFullAccess);
  });

  test("read-only token scope is refused on a mutating path; the same path allows a full-access token as a control", () => {
    // Mirrors what every mutating route.ts actually does: gate on
    // isReadOnly(scope) in addition to the role check from getAccessible*.
    const mutatingRouteGuard = (scope: TokenScope | undefined) => (isReadOnly(scope) ? "403 forbidden" : "allowed");

    expect(mutatingRouteGuard(unscopedReadOnlyPat)).toBe("403 forbidden");
    expect(mutatingRouteGuard(projectScopedReadOnlyPat)).toBe("403 forbidden");
    expect(mutatingRouteGuard(unscopedWritePat)).toBe("allowed");
    expect(mutatingRouteGuard(webSession)).toBe("allowed");
  });
});
