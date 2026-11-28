import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnv } from "@envhq/parser";
import { checkDestination, render } from "./export.ts";
import { childEnv } from "./run.ts";

test("inside Actions, printing dotenv or json to stdout is refused", () => {
  assert.throws(() => checkDestination("dotenv", undefined, true), /Refusing to print secrets into a CI log/);
  assert.throws(() => checkDestination("json", undefined, true), /Refusing/);
  assert.doesNotThrow(() => checkDestination("dotenv", ".env", true));
  assert.doesNotThrow(() => checkDestination("dotenv", undefined, false));
});

test("github-* formats need Actions and take no --output", () => {
  assert.throws(() => checkDestination("github-env", undefined, false), /only works inside a GitHub Actions step/);
  assert.throws(() => checkDestination("github-output", "x", true), /--output doesn't apply/);
  assert.doesNotThrow(() => checkDestination("github-env", undefined, true));
  assert.doesNotThrow(() => checkDestination("github-output", undefined, true));
});

test("dotenv output round-trips through the parser, multi-line values included", () => {
  const pairs = [
    { key: "A", value: "plain" },
    { key: "PEM", value: "line one\nline two" },
    { key: "QUOTED", value: 'has "quotes" and # hash' },
  ];
  assert.deepEqual(parseEnv(render("dotenv", pairs)), pairs);
});

test("json output is a flat key → value object", () => {
  assert.deepEqual(JSON.parse(render("json", [{ key: "A", value: "1" }, { key: "B", value: "x\ny" }])), {
    A: "1",
    B: "x\ny",
  });
});

test("run's child gets the values but not the credentials that fetched them", () => {
  const env = childEnv(
    { PATH: "/bin", ENVHQ_TOKEN: "tok", ENVHQ_DEPLOY_KEY: "envhq_dk_v2.a.b", API_URL: "stale" },
    [{ key: "API_URL", value: "fresh" }, { key: "NEW", value: "1" }],
  );
  assert.equal(env.ENVHQ_TOKEN, undefined);
  assert.equal(env.ENVHQ_DEPLOY_KEY, undefined);
  assert.equal(env.API_URL, "fresh", "EnvHQ's value wins over the inherited one");
  assert.equal(env.NEW, "1");
  assert.equal(env.PATH, "/bin");
});
