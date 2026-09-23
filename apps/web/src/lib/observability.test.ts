import { describe, test, expect } from "vitest";
import { scrubMessage, fingerprint } from "./observability";

/**
 * RM-18's first gotcha: "request bodies here contain ciphertext and variable
 * names. Neither belongs in a third-party error tracker."
 *
 * The scrubber is a blocklist, which is the weaker kind of defence and is
 * what the input shape forces — an error message is arbitrary free text. So
 * these tests are written from the direction that matters: take the actual
 * shapes this codebase's secrets have, put them in a message, and assert
 * they do not survive.
 */

describe("scrubMessage", () => {
  test.each([
    [
      "a CLI or deploy token",
      "auth failed for envhq_dGhpcy1pcy1hLXRva2Vu_abc123",
      "envhq_dGhpcy1pcy1hLXRva2Vu_abc123",
    ],
    [
      "a database connection string with a password",
      "connect ECONNREFUSED postgres://envhq:hunter2@db.example.com:5432/app",
      "hunter2",
    ],
    [
      "a bearer credential quoted into a message",
      'request failed with header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    ],
    [
      "ciphertext",
      "failed to decrypt 3q2+7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/w==",
      "3q2+7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/w==",
    ],
    [
      "an X25519 public key",
      "no wrap for key MCowBQYDK2VuAyEAxNiWqEGSL8eyZP9dcHWmPZTPWtLNeGq2AbCdEfGh",
      "MCowBQYDK2VuAyEAxNiWqEGSL8eyZP9dcHWmPZTPWtLNeGq2AbCdEfGh",
    ],
  ])("removes %s", (_label, message, secret) => {
    expect(scrubMessage(message)).not.toContain(secret);
  });

  test("leaves an ordinary message readable", () => {
    // Over-redacting is the safe direction, but a scrubber that destroyed
    // every message would make the whole store useless and push people back
    // to reading raw logs.
    const message = "Project not found";
    expect(scrubMessage(message)).toBe(message);
  });

  test("keeps enough of a real error to recognise it", () => {
    const scrubbed = scrubMessage(
      "insert into env_vars violates foreign key constraint env_vars_environment_id_fkey",
    );
    expect(scrubbed).toContain("foreign key constraint");
  });

  test("truncates, so nothing large rides along in a message field", () => {
    // A message is free text; a 2MB request body pasted into one is a real
    // way for content to reach a store that is not meant to hold it.
    const scrubbed = scrubMessage("x".repeat(10_000));
    expect(scrubbed.length).toBeLessThan(400);
  });

  test("redacts every occurrence, not just the first", () => {
    const scrubbed = scrubMessage("tried envhq_aaaaaaaaaaaa then envhq_bbbbbbbbbbbb");
    expect(scrubbed).not.toContain("envhq_aaaaaaaaaaaa");
    expect(scrubbed).not.toContain("envhq_bbbbbbbbbbbb");
  });
});

describe("fingerprint", () => {
  const stack = "Error: boom\n    at handleGet (/var/task/src/app/api/projects/route.ts:41:11)\n    at async X";

  test("groups occurrences that differ only in their message", () => {
    // The point of grouping. A message interpolating a project id would
    // otherwise make every project its own issue, and alert on each one —
    // the "alert that fires constantly" the ticket warns about.
    const a = fingerprint("api/projects/[id]", "TypeError", stack);
    const b = fingerprint("api/projects/[id]", "TypeError", stack);
    expect(a).toBe(b);
  });

  test("separates different routes, kinds and throw sites", () => {
    const base = fingerprint("api/projects/[id]", "TypeError", stack);
    const otherRoute = fingerprint("api/environments/[id]", "TypeError", stack);
    const otherKind = fingerprint("api/projects/[id]", "RangeError", stack);
    const otherSite = fingerprint(
      "api/projects/[id]",
      "TypeError",
      "Error: boom\n    at other (/var/task/src/lib/env-store.ts:12:3)",
    );
    expect(new Set([base, otherRoute, otherKind, otherSite]).size).toBe(4);
  });

  test("still groups when there is no stack at all", () => {
    expect(fingerprint("api/x", "Error", undefined)).toBe(fingerprint("api/x", "Error", undefined));
  });

  test("is not derived from the message", () => {
    // Asserted directly rather than implied: a fingerprint that included the
    // message would look correct in the grouping test above and still fail
    // on the real case, which is a message carrying an id.
    const withId = "Error: project 8f2c-… not found\n    at handleGet (/var/task/src/app/api/projects/route.ts:41:11)";
    const withOther = "Error: project aaaa-… not found\n    at handleGet (/var/task/src/app/api/projects/route.ts:41:11)";
    expect(fingerprint("api/projects/[id]", "Error", withId)).toBe(
      fingerprint("api/projects/[id]", "Error", withOther),
    );
  });
});
