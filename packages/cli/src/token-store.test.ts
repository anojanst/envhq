import { test } from "node:test";
import assert from "node:assert/strict";
import { envToken, resolveToken, keychainAvailable, storeSession, clearSession } from "./token-store.ts";

/**
 * The `ENVHQ_TOKEN` path is what every CI run uses, so it is tested
 * unconditionally. Keychain-backed cases need a real OS keyring (absent on a
 * headless CI box) and skip themselves when there isn't one.
 */

const URL = "https://envhq.test";

function withEnvToken<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.ENVHQ_TOKEN;
  if (value === undefined) delete process.env.ENVHQ_TOKEN;
  else process.env.ENVHQ_TOKEN = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.ENVHQ_TOKEN;
    else process.env.ENVHQ_TOKEN = previous;
  }
}

test("envToken trims and treats blank as unset", () => {
  withEnvToken("  tok_padded  ", () => assert.equal(envToken(), "tok_padded"));
  withEnvToken("   ", () => assert.equal(envToken(), null));
  withEnvToken("", () => assert.equal(envToken(), null));
  withEnvToken(undefined, () => assert.equal(envToken(), null));
});

test("ENVHQ_TOKEN resolves with source 'env'", () => {
  withEnvToken("tok_ci", () => {
    const resolved = resolveToken(URL);
    assert.deepEqual(resolved, { token: "tok_ci", source: "env" });
  });
});

test("ENVHQ_TOKEN wins over anything in the keychain", { skip: !keychainAvailable() }, () => {
  const url = `${URL}/precedence`;
  try {
    storeSession(url, { token: "tok_keychain", userId: "u_1" });
    withEnvToken("tok_env", () => {
      const resolved = resolveToken(url);
      assert.equal(resolved?.token, "tok_env");
      assert.equal(resolved?.source, "env");
      assert.equal(resolved?.userId, undefined, "the env path carries no stored metadata");
    });
    // …and with the env var gone, the keychain value is still there untouched.
    withEnvToken(undefined, () => {
      const resolved = resolveToken(url);
      assert.equal(resolved?.token, "tok_keychain");
      assert.equal(resolved?.source, "keychain");
    });
  } finally {
    clearSession(url);
  }
});

test("a stored session round-trips through the keychain", { skip: !keychainAvailable() }, () => {
  const url = `${URL}/roundtrip`;
  try {
    storeSession(url, { token: "tok_1", expiresAt: "2030-01-01T00:00:00.000Z", userId: "u_9" });
    withEnvToken(undefined, () => {
      const resolved = resolveToken(url);
      assert.equal(resolved?.token, "tok_1");
      assert.equal(resolved?.expiresAt, "2030-01-01T00:00:00.000Z");
      assert.equal(resolved?.userId, "u_9");
    });
  } finally {
    clearSession(url);
  }
});

test("clearSession removes the stored token", { skip: !keychainAvailable() }, () => {
  const url = `${URL}/cleared`;
  storeSession(url, { token: "tok_gone" });
  clearSession(url);
  withEnvToken(undefined, () => assert.equal(resolveToken(url), null));
});
