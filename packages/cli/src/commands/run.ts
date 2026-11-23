import { Option, type Command } from "commander";
import { spawn } from "node:child_process";
import type { EnvPair } from "@envhq/parser";
import { fail } from "../shared/ui.ts";
import { resolveTarget } from "../shared/target.ts";
import { failureMessage, fetchPlaintextEnv } from "../shared/secrets.ts";
import { checkRequired, parseRequired } from "../shared/require.ts";
import { emitMasks, inGitHubActions } from "../shared/github.ts";

/**
 * `envhq run -- <command>` — ADR-018's pipeline primitive: decrypt in memory,
 * inject into one child process, exec it. Nothing is written to disk, so
 * there is no file left on a runner for a cache, an artifact upload or a
 * later step to pick up.
 *
 * EnvHQ's values win over anything already in the environment — asking for
 * an environment by name and getting a stale shell variable instead would be
 * the surprising outcome. The EnvHQ credentials themselves are removed from
 * the child: it needs the values, not the means to fetch them again.
 */
export function register(program: Command): void {
  program
    .command("run")
    .description("Run a command with an environment's variables injected, without writing them to disk.")
    .argument("<command...>", "the command to run, after `--` (e.g. envhq run -- npm start)")
    .addOption(
      new Option("-p, --project <name|id>", "project name or id (defaults to the linked project)").env("ENVHQ_PROJECT"),
    )
    .addOption(new Option("-e, --env <name>", "environment (defaults to the linked default)").env("ENVHQ_ENVIRONMENT"))
    .addOption(
      new Option("--require <names>", "fail unless these variables exist and are non-empty (comma-separated)").env(
        "ENVHQ_REQUIRE",
      ),
    )
    .action(async (command: string[], opts: { project?: string; env?: string; require?: string }) => {
      let pairs: EnvPair[];
      try {
        const target = await resolveTarget(opts);
        pairs = await fetchPlaintextEnv(target.projectId, target.envId);
        checkRequired(pairs, parseRequired(opts.require), `${target.projectName}/${target.envName}`);
      } catch (err) {
        fail(failureMessage(err));
      }
      // Before the child exists, so nothing it prints can beat the masks.
      if (inGitHubActions()) emitMasks(pairs);
      process.exit(await runWith(command, pairs));
    });
}

export function childEnv(base: NodeJS.ProcessEnv, pairs: EnvPair[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  delete env.ENVHQ_TOKEN;
  delete env.ENVHQ_DEPLOY_KEY;
  for (const p of pairs) env[p.key] = p.value;
  return env;
}

function runWith(command: string[], pairs: EnvPair[]): Promise<number> {
  const [file, ...args] = command;
  return new Promise((resolve) => {
    const child = spawn(file!, args, {
      stdio: "inherit",
      env: childEnv(process.env, pairs),
      // `npm`, `pnpm` and friends are .cmd shims on Windows, which only a
      // shell can start. The arguments are the user's own command line.
      shell: process.platform === "win32",
    });

    const forward = (signal: NodeJS.Signals) => child.kill(signal);
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);

    child.on("error", (err) => {
      console.error(`✖ Couldn't start "${file}": ${err.message}`);
      resolve(127);
    });
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      // A child killed by a signal has no exit code; 128+n is the shell convention.
      resolve(code ?? (signal ? 128 + signalNumber(signal) : 1));
    });
  });
}

function signalNumber(signal: NodeJS.Signals): number {
  return ({ SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 } as Record<string, number>)[signal] ?? 1;
}
