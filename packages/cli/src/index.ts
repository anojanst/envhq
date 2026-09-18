import { Command } from "commander";
import { CLI_VERSION } from "./config.ts";
import { fail } from "./shared/ui.ts";

import * as login from "./commands/login.ts";
import * as logout from "./commands/logout.ts";
import * as unlock from "./commands/unlock.ts";
import * as lock from "./commands/lock.ts";
import * as whoami from "./commands/whoami.ts";
import * as orgs from "./commands/orgs.ts";
import * as projects from "./commands/projects.ts";
import * as link from "./commands/link.ts";
import * as init from "./commands/init.ts";
import * as env from "./commands/env.ts";
import * as pull from "./commands/pull.ts";
import * as push from "./commands/push.ts";
import * as diff from "./commands/diff.ts";
import * as history from "./commands/history.ts";
import * as rollback from "./commands/rollback.ts";
import * as status from "./commands/status.ts";

/**
 * Wiring only — every command lives in its own module under `./commands`, and
 * the shared prompts/link/crypto helpers under `./shared`.
 *
 * Registration order is the order `envhq --help` lists commands in, and that
 * output is pinned by `commands/cli-surface.test.ts`. Adding a command is fine;
 * renaming or removing one breaks every published CLI that already uses it —
 * see the frozen wire contracts in CLAUDE.md.
 */
const program = new Command();

program
  .name("envhq")
  .description("Sync your environment variables from the terminal.")
  .version(CLI_VERSION);

for (const command of [
  login,
  logout,
  unlock,
  lock,
  whoami,
  orgs,
  projects,
  link,
  init,
  env,
  pull,
  push,
  diff,
  history,
  rollback,
  status,
]) {
  command.register(program);
}

program.parseAsync().catch((err) => fail(String(err)));
