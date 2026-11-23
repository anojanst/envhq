import { Option, type Command } from "commander";
import { chmod, writeFile } from "node:fs/promises";
import { serializeEnv, type EnvPair } from "@envhq/parser";
import { fail } from "../shared/ui.ts";
import { resolveTarget } from "../shared/target.ts";
import { failureMessage, fetchPlaintextEnv } from "../shared/secrets.ts";
import { checkRequired, parseRequired } from "../shared/require.ts";
import { appendFileCommand, emitMasks, inGitHubActions } from "../shared/github.ts";

export const FORMATS = ["dotenv", "json", "github-env", "github-output"] as const;
export type Format = (typeof FORMATS)[number];

/**
 * `envhq export` — hand an environment's plaintext to something that can't
 * wrap itself in `envhq run`: a later workflow step, a deploy tool that
 * reads a file. `run` is the safer shape and the docs lead with it; this
 * exists because a GitHub Action is one step and cannot wrap the next one.
 *
 * Non-interactive by design — no merge, no overwrite prompt, no backup —
 * which is what separates it from `pull`. Status lines go to stderr so
 * stdout carries only the data.
 */
export function register(program: Command): void {
  program
    .command("export")
    .description("Print or write an environment's decrypted variables, for scripts and CI.")
    .addOption(
      new Option("-p, --project <name|id>", "project name or id (defaults to the linked project)").env("ENVHQ_PROJECT"),
    )
    .addOption(new Option("-e, --env <name>", "environment (defaults to the linked default)").env("ENVHQ_ENVIRONMENT"))
    .addOption(new Option("--format <format>", "output format").choices(FORMATS).default("dotenv"))
    .addOption(
      new Option("--require <names>", "fail unless these variables exist and are non-empty (comma-separated)").env(
        "ENVHQ_REQUIRE",
      ),
    )
    .option("-o, --output <file>", "write to this file instead of stdout (dotenv and json only)")
    .option("--no-mask", "don't register values with the GitHub Actions log masker")
    .action(async (opts: { project?: string; env?: string; require?: string; format: Format; output?: string; mask: boolean }) => {
      try {
        checkDestination(opts.format, opts.output, inGitHubActions());

        const target = await resolveTarget(opts);
        const pairs = await fetchPlaintextEnv(target.projectId, target.envId);
        checkRequired(pairs, parseRequired(opts.require), `${target.projectName}/${target.envName}`);

        // First, before any value can reach a log.
        if (inGitHubActions()) {
          if (opts.mask) emitMasks(pairs);
          else console.error("::warning::envhq export ran with --no-mask: these values will appear unmasked in logs.");
        }

        await write(opts.format, pairs, opts.output);

        const where =
          opts.format === "github-env"
            ? "the job environment"
            : opts.format === "github-output"
              ? "step outputs"
              : (opts.output ?? "stdout");
        const n = pairs.length;
        console.error(`✔ Exported ${n} variable${n === 1 ? "" : "s"} from ${target.projectName}/${target.envName} → ${where}.`);
        if (n === 0 && inGitHubActions()) {
          console.error(`::warning::${target.projectName}/${target.envName} has no variables — is this the environment you meant?`);
        }
      } catch (err) {
        fail(failureMessage(err));
      }
    });
}

/**
 * Refuses destinations that don't make sense, before anything is fetched.
 *
 * In particular: inside GitHub Actions, dotenv/json on stdout is refused.
 * Masks have to be written to stdout too, so printing data there would
 * either put the mask commands into whatever stdout is redirected to, or —
 * with `--no-mask` — put the secrets straight into the job log.
 */
export function checkDestination(format: Format, output: string | undefined, actions: boolean): void {
  const isFileCommand = format === "github-env" || format === "github-output";
  if (isFileCommand && output) throw new Error(`--output doesn't apply to --format ${format}.`);
  if (isFileCommand && !actions) throw new Error(`--format ${format} only works inside a GitHub Actions step.`);
  if (!isFileCommand && !output && actions) {
    throw new Error(
      `Refusing to print secrets into a CI log. Use --output <file>, or --format github-env, ` +
        "or wrap your command in `envhq run -- …` instead.",
    );
  }
}

export function render(format: "dotenv" | "json", pairs: EnvPair[]): string {
  if (format === "json") return JSON.stringify(Object.fromEntries(pairs.map((p) => [p.key, p.value])), null, 2) + "\n";
  return serializeEnv(pairs);
}

async function write(format: Format, pairs: EnvPair[], output: string | undefined): Promise<void> {
  if (format === "github-env") return appendFileCommand("GITHUB_ENV", pairs);
  if (format === "github-output") return appendFileCommand("GITHUB_OUTPUT", pairs);

  const body = render(format, pairs);
  // Owner-only: on a shared runner or a dev box, a secrets file nobody else
  // needs to read shouldn't be world-readable by default.
  // `mode` only applies on create, hence the chmod for an existing file.
  if (output) {
    await writeFile(output, body, { mode: 0o600 });
    await chmod(output, 0o600);
  } else process.stdout.write(body);
}
