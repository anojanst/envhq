import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * The CLI's public surface, pinned.
 *
 * Published CLI versions can't be updated by us, and neither can the scripts
 * people wrote against them — so every command, subcommand, argument, flag and
 * default here is frozen (see the wire contracts in CLAUDE.md). Adding one is
 * fine and shows up as a fixture addition; renaming or removing one is a
 * breaking change and this test is where that decision gets made deliberately.
 *
 * Runs the real built binary, so it also catches a module that fails to load.
 * After an intentional change, regenerate the fixture with:
 *   UPDATE_FIXTURES=1 pnpm --filter envhq test
 */
const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "../../dist/index.js");

/** Terminal width is undefined over a pipe, so commander wraps at its 80-col default. */
const invoke = async (args: string[]) => (await run(process.execPath, [CLI, ...args])).stdout;

const SECTIONS: string[][] = [
  [],
  ...["login", "logout", "unlock", "lock", "whoami", "orgs", "projects", "link", "init", "env",
      "pull", "push", "diff", "history", "rollback", "status"].map((c) => [c]),
  ["projects", "create"],
  ...["map", "create", "list"].map((s) => ["env", s]),
];

test("the CLI surface matches the fixture exactly", async () => {
  let actual = "";
  for (const section of SECTIONS) {
    const args = [...section, "--help"];
    actual += `### envhq ${args.join(" ")}\n`;
    actual += await invoke(args);
  }

  const fixture = join(here, "cli-surface.fixture.txt");
  if (process.env.UPDATE_FIXTURES) {
    await writeFile(fixture, actual);
    return;
  }

  assert.equal(actual, await readFile(fixture, "utf8"));
});

test("--version reports the published package version", async () => {
  const pkg = JSON.parse(
    await readFile(join(here, "../../package.json"), "utf8"),
  ) as { version: string };
  const stdout = await invoke(["--version"]);
  assert.equal(stdout.trim(), pkg.version, "tsup bakes package.json's version in at build time");
});

test("every top-level command is registered and runnable", async () => {
  const stdout = await invoke(["--help"]);
  const listed = stdout
    .slice(stdout.indexOf("Commands:"))
    .split("\n")
    .map((line) => line.match(/^ {2}(\S+)/)?.[1])
    .filter((name): name is string => Boolean(name));

  assert.deepEqual(listed, [
    "login", "logout", "unlock", "lock", "whoami", "orgs", "projects", "link",
    "init", "env", "pull", "push", "diff", "history", "rollback", "status", "help",
  ]);
});

test("an unknown command exits non-zero rather than doing something surprising", async () => {
  await assert.rejects(
    () => invoke(["definitely-not-a-command"]),
    (err: unknown) => {
      const e = err as { code?: number; stderr?: string };
      assert.equal(e.code, 1);
      assert.match(e.stderr ?? "", /unknown command/i);
      return true;
    },
  );
});
