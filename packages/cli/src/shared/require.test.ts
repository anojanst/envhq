import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRequired, parseRequired } from "./require.ts";

const pairs = [
  { key: "HELLO_ENVHQ", value: "hi" },
  { key: "DATABASE_URL", value: "postgres://x" },
  { key: "BLANK", value: "" },
];

test("names split on commas, spaces and newlines, duplicates dropped", () => {
  assert.deepEqual(parseRequired(" A, B\nC  D,,A "), ["A", "B", "C", "D"]);
  assert.deepEqual(parseRequired(""), []);
  assert.deepEqual(parseRequired(undefined), []);
});

test("nothing required, or everything present: passes", () => {
  assert.doesNotThrow(() => checkRequired(pairs, [], "shop/dev"));
  assert.doesNotThrow(() => checkRequired(pairs, ["HELLO_ENVHQ", "DATABASE_URL"], "shop/dev"));
});

test("a typo fails, names the environment, and suggests the real name", () => {
  assert.throws(
    () => checkRequired(pairs, ["HEL_ENVHC"], "shop/dev"),
    /^Error: shop\/dev is missing 1 required variable: HEL_ENVHC \(did you mean HELLO_ENVHQ\?\)\. Stopped before/,
  );
});

test("every missing name is listed at once, with no suggestion when nothing is close", () => {
  assert.throws(
    () => checkRequired(pairs, ["STRIPE_KEY", "HELLO_ENVHQ", "DATABASE_UR"], "shop/dev"),
    /missing 2 required variables: STRIPE_KEY, DATABASE_UR \(did you mean DATABASE_URL\?\)\./,
  );
});

test("an empty value counts as missing", () => {
  assert.throws(() => checkRequired(pairs, ["BLANK"], "shop/dev"), /BLANK \(set, but empty\)/);
});

test("the message carries names only, never a value", () => {
  try {
    checkRequired(pairs, ["HELLO_ENVHQX"], "shop/dev");
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(!(err as Error).message.includes("postgres://x"));
    assert.ok(!(err as Error).message.includes("hi)"));
  }
});
