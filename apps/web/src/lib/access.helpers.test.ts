import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test("null input returns null, silently — the ordinary case for a grant with no per-env cap", () => {
    expect(parseEnvScope(null)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("empty string returns null, silently", () => {
    expect(parseEnvScope("")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("valid JSON object is parsed as-is, silently", () => {
    expect(parseEnvScope('{"prod":"viewer"}')).toEqual({ prod: "viewer" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("malformed JSON (unparseable) returns null, not a thrown error, and logs so the corruption is visible", () => {
    expect(parseEnvScope("not-json")).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("env_scope");
  });

  test("a JSON literal null returns null, silently — a distinct, deliberate \"no cap\" encoding, not corruption", () => {
    expect(parseEnvScope("null")).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("a JSON number is valid JSON but the wrong shape — returns null and logs", () => {
    expect(parseEnvScope("5")).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test("a JSON string is valid JSON but the wrong shape — returns null and logs", () => {
    expect(parseEnvScope('"hello"')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test("a JSON array passes the typeof \"object\" check (arrays are objects in JS) and is returned as-is, silently", () => {
    // Documents actual current behavior, not a recommendation: `capRoleForEnv`
    // then does `envScope[envName]` on this value, which is `undefined` for
    // any string key on a plain array, so it behaves the same as an uncapped
    // grant in practice — never an escalation, just an unintended pass-through.
    // Not flagged as malformed since it's syntactically and structurally the
    // shape the parser accepts, even though it's not a useful EnvScope.
    expect(parseEnvScope("[]")).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
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
