import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { CLI_VERSION, credentialMasks, plan, readInputs, type Inputs } from "./action.ts";

const here = dirname(fileURLToPath(import.meta.url));
const inputs = (over: Partial<Inputs> = {}): Inputs => ({
  token: "envhq_tok",
  key: "envhq_dk_v2.pub.priv",
  project: "shop",
  environment: "staging",
  format: "env",
  mask: "true",
  path: ".env",
  required: "",
  ...over,
});

test("the CLI version is pinned exactly, never a range", () => {
  assert.match(CLI_VERSION, /^\d+\.\d+\.\d+$/);
});

test("the pinned CLI version has the export command this action calls", () => {
  // The pin may run ahead of packages/cli/package.json: Changesets bumps that
  // in its "Version Packages" PR, and the action ships after the CLI does
  // (see this package's README). It must never point before `export` existed.
  const [maj, min] = CLI_VERSION.split(".").map(Number);
  assert.ok(maj! > 0 || min! >= 10, "`envhq export` first shipped in 0.10.0");
});

test("the pinned CLI version understands ENVHQ_REQUIRE, which the `required` input relies on", () => {
  const [maj, min] = CLI_VERSION.split(".").map(Number);
  assert.ok(maj! > 0 || min! >= 11, "`--require` / ENVHQ_REQUIRE first shipped in 0.11.0");
});

test("`required` reaches the CLI as ENVHQ_REQUIRE, and only when it was given", () => {
  const given = plan(inputs({ required: "DATABASE_URL,\nSTRIPE_KEY" }), { ENVHQ_REQUIRE: "FROM_JOB" }, "linux");
  assert.ok(!("errors" in given));
  assert.equal(given.env.ENVHQ_REQUIRE, "DATABASE_URL,\nSTRIPE_KEY");
  assert.ok(!given.args.join(" ").includes("DATABASE_URL"), "names travel as environment, not argv");

  const omitted = plan(inputs(), { ENVHQ_REQUIRE: "FROM_JOB" }, "linux");
  assert.ok(!("errors" in omitted));
  assert.equal(omitted.env.ENVHQ_REQUIRE, "FROM_JOB", "a job-level ENVHQ_REQUIRE still applies");

  assert.equal(readInputs({ INPUT_REQUIRED: " A, B " }).required, "A, B");
});

test("inputs are read the way the runner passes them", () => {
  const read = readInputs({ INPUT_TOKEN: " t ", INPUT_KEY: "k", INPUT_PROJECT: "p", INPUT_ENVIRONMENT: "e" });
  assert.deepEqual(read, { token: "t", key: "k", project: "p", environment: "e", format: "env", mask: "true", path: ".env", required: "" });
});

test("each format maps to one pinned export invocation", () => {
  const env = plan(inputs(), {}, "linux");
  assert.ok(!("errors" in env));
  assert.deepEqual(env.args, ["--yes", `envhq@${CLI_VERSION}`, "export", "--format", "github-env"]);

  const outputs = plan(inputs({ format: "outputs" }), {}, "linux");
  assert.ok(!("errors" in outputs));
  assert.deepEqual(outputs.args.slice(-2), ["--format", "github-output"]);

  const dotenv = plan(inputs({ format: "dotenv", path: "config/ci.env", mask: "false" }), {}, "linux");
  assert.ok(!("errors" in dotenv));
  assert.deepEqual(dotenv.args.slice(3), ["--format", "dotenv", "--output", "config/ci.env", "--no-mask"]);
});

test("secrets and names travel as environment, never on the command line", () => {
  const p = plan(inputs({ project: "a; rm -rf /" }), { PATH: "/bin", ENVHQ_URL: "https://self.example" }, "win32");
  assert.ok(!("errors" in p));
  const argv = p.args.join(" ");
  for (const v of ["envhq_tok", "envhq_dk_v2.pub.priv", "a; rm -rf /", "staging"]) assert.ok(!argv.includes(v), `${v} not in argv`);
  assert.equal(p.env.ENVHQ_TOKEN, "envhq_tok");
  assert.equal(p.env.ENVHQ_DEPLOY_KEY, "envhq_dk_v2.pub.priv");
  assert.equal(p.env.ENVHQ_PROJECT, "a; rm -rf /");
  assert.equal(p.env.ENVHQ_URL, "https://self.example", "a job-level ENVHQ_URL reaches the CLI");
  assert.equal(p.command, "npx.cmd");
  assert.equal(p.shell, true);
});

test("bad inputs are all reported, and nothing runs", () => {
  const p = plan(inputs({ token: "", key: "", format: "yaml", mask: "maybe" }), {}, "linux");
  assert.ok("errors" in p);
  assert.equal(p.errors.length, 4);
});

test("a dotenv path a shell could act on is refused", () => {
  for (const path of ["a&b", "$(x)", "a b", "x|y", "%PATH%"]) {
    assert.ok("errors" in plan(inputs({ format: "dotenv", path }), {}, "win32"), path);
  }
});

test("the credentials themselves are masked", () => {
  assert.deepEqual(credentialMasks(inputs()), ["::add-mask::envhq_tok", "::add-mask::envhq_dk_v2.pub.priv"]);
});

/**
 * The committed bundle, run as the runner runs it, with `npx` swapped for a
 * recorder on PATH — so this checks what actually ships, not just the module.
 */
test("the built action launches the pinned CLI and fails the step when it fails", { skip: process.platform === "win32" }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "envhq-action-"));
  try {
    const record = join(dir, "record.json");
    await writeFile(
      join(dir, "npx"),
      `#!/usr/bin/env node
require("fs").writeFileSync(${JSON.stringify(record)}, JSON.stringify({ args: process.argv.slice(2), project: process.env.ENVHQ_PROJECT, key: process.env.ENVHQ_DEPLOY_KEY }));
process.exit(Number(process.env.FAKE_EXIT || 0));
`,
    );
    await chmod(join(dir, "npx"), 0o755);
    const env = {
      PATH: `${dir}:${process.env.PATH}`,
      INPUT_TOKEN: "envhq_tok",
      INPUT_KEY: "envhq_dk_v2.pub.priv",
      INPUT_PROJECT: "shop",
      INPUT_ENVIRONMENT: "staging",
    };
    const run = promisify(execFile);
    const bundle = join(here, "../dist/index.cjs");

    const { stdout } = await run(process.execPath, [bundle], { env });
    assert.ok(stdout.startsWith("::add-mask::envhq_tok\n::add-mask::envhq_dk_v2.pub.priv\n"));
    const recorded = JSON.parse(await readFile(record, "utf8"));
    assert.deepEqual(recorded.args, ["--yes", `envhq@${CLI_VERSION}`, "export", "--format", "github-env"]);
    assert.equal(recorded.project, "shop");
    assert.equal(recorded.key, "envhq_dk_v2.pub.priv");

    await assert.rejects(
      () => run(process.execPath, [bundle], { env: { ...env, FAKE_EXIT: "1" } }),
      (err: { code?: number; stdout?: string }) => err.code === 1 && /::error::EnvHQ couldn't load shop\/staging/.test(err.stdout ?? ""),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
