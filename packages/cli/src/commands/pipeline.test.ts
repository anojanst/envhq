import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  generateKeypair,
  generateDek,
  sealToPublicKey,
  encryptValue,
  encodeBase64,
  type Keypair,
} from "@envhq/crypto";

/**
 * The pipeline path end to end (RM-12): the real built binary, on a "runner"
 * with no config file, no keychain session and no human — only ENVHQ_TOKEN
 * and ENVHQ_DEPLOY_KEY — against a stand-in for the export route that seals
 * a real DEK to a real deploy key. These are the ticket's acceptance criteria
 * that can be checked without a GitHub runner; the cross-OS matrix lives in
 * packages/github-action's own workflow.
 */
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "../../dist/index.js");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ENV_ID = "22222222-2222-4222-8222-222222222222";
const GOOD_TOKEN = "envhq_good";
const VALUES = {
  SECRET: "hunter2-is-not-a-password",
  PEM: "-----BEGIN KEY-----\nMIIsecretline\n-----END KEY-----",
};

let server: Server;
let url: string;
let deployKey: Keypair;
let home: string;
const seen: { deployHeader?: string }[] = [];

before(async () => {
  deployKey = await generateKeypair();
  const dek = await generateDek();
  const wrappedDek = await sealToPublicKey(encodeBase64(dek), deployKey.publicKey);
  const pairs = await Promise.all(
    Object.entries(VALUES).map(async ([key, value]) => {
      const { ciphertext, nonce } = await encryptValue(dek, value);
      return { key, ciphertext, iv: nonce };
    }),
  );

  server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    // Like the real server (apps/web lib/client-version.ts): a CLI that doesn't
    // say it speaks crypto suite v2 is refused before anything else.
    if (req.headers["x-envhq-crypto"] !== "2") return send(426, { error: "update envhq" });
    // A revoked deploy key's token is deleted with it, so the server sees an unknown token.
    if (req.headers.authorization !== `Bearer ${GOOD_TOKEN}`) return send(401, { error: "Unauthorized" });

    const path = req.url!.split("?")[0];
    if (path === "/api/orgs") return send(200, { orgs: [{ id: "org_1", name: "Acme", role: "member" }] });
    if (path === "/api/projects") return send(200, { projects: [{ id: PROJECT_ID, name: "shop" }] });
    if (path === `/api/projects/${PROJECT_ID}`) {
      return send(200, { project: { id: PROJECT_ID, name: "shop" }, environments: [{ id: ENV_ID, name: "staging" }] });
    }
    if (path === `/api/environments/${ENV_ID}/export`) {
      const presented = req.headers["x-envhq-deploy-key"] as string | undefined;
      seen.push({ deployHeader: presented });
      if (presented !== deployKey.publicKey) {
        return send(403, { error: "This deploy key is not valid for this project." });
      }
      return send(200, { pairs, count: pairs.length, version: 3, wrappedDek, keyVersion: 1 });
    }
    send(404, { error: "Not found" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  home = await mkdtemp(join(tmpdir(), "envhq-runner-"));
});

after(async () => {
  server.close();
  await rm(home, { recursive: true, force: true });
});

/** A clean runner environment: nothing inherited that could mask a bug (no real HOME, no real token). */
function runner(extra: Record<string, string> = {}) {
  return {
    PATH: process.env.PATH!,
    HOME: home,
    USERPROFILE: home,
    ENVHQ_URL: url,
    ENVHQ_TOKEN: GOOD_TOKEN,
    ENVHQ_DEPLOY_KEY: `envhq_dk_v2.${deployKey.publicKey}.${deployKey.privateKey}`,
    GITHUB_ACTIONS: "true",
    ...extra,
  };
}

const cli = (args: string[], env: Record<string, string>) => exec(process.execPath, [CLI, ...args], { env });

test("github-env: every value is masked before anything else, then lands in GITHUB_ENV", async () => {
  const githubEnv = join(home, "github_env");
  const { stdout, stderr } = await cli(
    ["export", "--project", "shop", "--env", "staging", "--format", "github-env"],
    runner({ GITHUB_ENV: githubEnv }),
  );

  const lines = stdout.trimEnd().split("\n");
  assert.ok(lines.length > 0 && lines.every((l) => l.startsWith("::add-mask::")), "stdout carries only mask commands");
  assert.ok(lines.includes(`::add-mask::${VALUES.SECRET}`));
  assert.ok(lines.includes("::add-mask::MIIsecretline"), "each line of a multi-line value is masked");
  assert.ok(lines.includes(`::add-mask::${Buffer.from(VALUES.SECRET).toString("base64")}`));
  assert.ok(!stderr.includes(VALUES.SECRET), "the status line never carries a value");

  const written = await readFile(githubEnv, "utf8");
  assert.ok(written.includes(`\n${VALUES.SECRET}\n`));
  assert.ok(written.includes(`\n${VALUES.PEM}\n`));
  assert.equal(seen.at(-1)!.deployHeader, deployKey.publicKey, "only the public half went over the wire");
  assert.ok(!seen.some((s) => s.deployHeader?.includes(deployKey.privateKey)));
});

test("run: a deliberate `echo $SECRET` comes after its mask, and the child never sees the credentials", async () => {
  const script =
    "console.log(process.env.SECRET);" +
    "console.log(String(Boolean(process.env.ENVHQ_TOKEN || process.env.ENVHQ_DEPLOY_KEY)))";
  const { stdout } = await cli(
    ["run", "--project", PROJECT_ID, "--env", "staging", "--", process.execPath, "-e", script],
    runner(),
  );
  const lines = stdout.trimEnd().split("\n");
  const maskAt = lines.indexOf(`::add-mask::${VALUES.SECRET}`);
  const echoAt = lines.indexOf(VALUES.SECRET);
  assert.ok(maskAt >= 0 && echoAt > maskAt, "the runner registers the mask before the echo, so the log shows ***");
  assert.equal(lines.at(-1), "false");
});

test("run propagates the child's exit code", async () => {
  await assert.rejects(
    () => cli(["run", "-p", PROJECT_ID, "-e", "staging", "--", process.execPath, "-e", "process.exit(7)"], runner()),
    (err: { code?: number }) => err.code === 7,
  );
});

test("--require: a missing name fails before anything is written, naming it and the likely typo", async () => {
  const githubEnv = join(home, "github_env_required");
  await assert.rejects(
    () =>
      cli(
        ["export", "-p", "shop", "-e", "staging", "--format", "github-env", "--require", "SECRET,SECRT"],
        runner({ GITHUB_ENV: githubEnv }),
      ),
    (err: { code?: number; stderr?: string; stdout?: string }) =>
      err.code === 1 &&
      /shop\/staging is missing 1 required variable: SECRT \(did you mean SECRET\?\)/.test(err.stderr ?? "") &&
      !(err.stdout ?? "").includes("::add-mask::"),
  );
  await assert.rejects(() => stat(githubEnv), "GITHUB_ENV was never written");
});

test("ENVHQ_REQUIRE works the same as --require, and run never starts the command", async () => {
  await assert.rejects(
    () =>
      cli(
        ["run", "-p", "shop", "-e", "staging", "--", process.execPath, "-e", "console.log('started')"],
        runner({ ENVHQ_REQUIRE: "SECRET\nMISSING_ONE" }),
      ),
    (err: { code?: number; stderr?: string; stdout?: string }) =>
      err.code === 1 && /MISSING_ONE/.test(err.stderr ?? "") && !(err.stdout ?? "").includes("started"),
  );
  const { stdout } = await cli(
    ["run", "-p", "shop", "-e", "staging", "--require", "SECRET PEM", "--", process.execPath, "-e", "console.log('started')"],
    runner(),
  );
  assert.equal(stdout.trimEnd().split("\n").at(-1), "started");
});

test("a revoked deploy key fails the job loudly and says what to do", async () => {
  await assert.rejects(
    () => cli(["export", "-p", "shop", "-e", "staging", "--format", "github-env"], runner({ ENVHQ_TOKEN: "envhq_revoked", GITHUB_ENV: join(home, "unused") })),
    (err: { code?: number; stderr?: string }) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr ?? "", /deploy key may have been revoked/);
      assert.match(err.stderr ?? "", /Issue a new deploy key/);
      return true;
    },
  );
  await assert.rejects(() => stat(join(home, "unused")), "nothing was written for the next step to half-run with");
});

test("a deploy key from another project is refused with the same advice", async () => {
  const other = await generateKeypair();
  await assert.rejects(
    () => cli(["export", "-p", "shop", "-e", "staging", "-o", join(home, "x.env")], runner({ ENVHQ_DEPLOY_KEY: `envhq_dk_v2.${other.publicKey}.${other.privateKey}` })),
    (err: { code?: number; stderr?: string }) =>
      err.code === 1 && /not valid for this project/.test(err.stderr ?? "") && /Issue a new deploy key/.test(err.stderr ?? ""),
  );
});

test("on CI without a deploy key it fails at once instead of waiting on a passphrase prompt", async () => {
  const env = runner({ CI: "true" });
  delete (env as Record<string, string>).ENVHQ_DEPLOY_KEY;
  await assert.rejects(
    () => cli(["export", "-p", "shop", "-e", "staging", "-o", join(home, "y.env")], env),
    (err: { code?: number; stderr?: string }) => err.code === 1 && /ENVHQ_DEPLOY_KEY isn't set/.test(err.stderr ?? ""),
  );
});

test("dotenv --output writes an owner-only file", async () => {
  const out = join(home, "ci.env");
  await cli(["export", "-p", "shop", "-e", "staging", "--output", out], runner());
  assert.match(await readFile(out, "utf8"), /SECRET=/);
  if (process.platform !== "win32") assert.equal((await stat(out)).mode & 0o777, 0o600);
});
