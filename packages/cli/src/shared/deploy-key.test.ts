import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateKeypair, generateDek, sealToPublicKey, unsealWithPrivateKey, encodeBase64 } from "@envhq/crypto";
import { parseDeployKeySecret } from "./deploy-key.ts";

const here = dirname(fileURLToPath(import.meta.url));

test("parses the secret the web app mints, and the halves open a DEK sealed to it", async () => {
  const keypair = await generateKeypair();
  const secret = `envhq_dk_v2.${keypair.publicKey}.${keypair.privateKey}`;

  const parsed = parseDeployKeySecret(`  ${secret}\n`);
  assert.deepEqual(parsed, keypair);

  const dek = encodeBase64(await generateDek());
  const sealed = await sealToPublicKey(dek, keypair.publicKey);
  assert.equal(await unsealWithPrivateKey(sealed, parsed.publicKey, parsed.privateKey), dek);
});

test("rejects anything that isn't a v2 deploy key, without echoing it", () => {
  for (const bad of ["", "envhq_dk_v2.onlyone", "envhq_dk_v3.a.b", "envhq_pat_abc", "envhq_dk_v2..b", "a.b.c.d"]) {
    assert.throws(
      () => parseDeployKeySecret(bad),
      (err: Error) => /doesn't look like an EnvHQ deploy key/.test(err.message) && (bad === "" || !err.message.includes(bad)),
    );
  }
});

test("a pre-v2 deploy key gets told to reissue, without echoing the key", () => {
  const old = "envhq_dk_v1.cHVi.cHJpdmF0ZQ==";
  assert.throws(
    () => parseDeployKeySecret(old),
    (err: Error) =>
      /older deploy key/.test(err.message) && /Issue a new deploy key/.test(err.message) && !err.message.includes("cHJpdmF0ZQ"),
  );
});

test("the prefix matches the one the web app mints", async () => {
  // Duplicated on purpose (the web app isn't a CLI dependency); this is what
  // stops the two drifting apart silently.
  const web = await readFile(join(here, "../../../../apps/web/src/lib/deploy-key-client.ts"), "utf8");
  assert.match(web, /const SECRET_PREFIX = "envhq_dk_v2";/);
});
