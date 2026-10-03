import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import type { EnvPair } from "@envhq/parser";

/**
 * GitHub Actions workflow commands — masking, and the `GITHUB_ENV` /
 * `GITHUB_OUTPUT` file commands. Pure string builders plus two appenders, so
 * the exact bytes the runner sees are what the tests assert.
 *
 * Masking is per literal string: the runner replaces exactly what it was
 * told to, nothing derived from it. So a value is registered in every shape
 * it is likely to reach a log in, and always **before** anything else is
 * written — a value printed one line ahead of its mask is a leaked value.
 */

export function inGitHubActions(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

/** Workflow-command data escaping, as `@actions/core` does it. */
function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/**
 * Every string that should be registered as a secret for one value.
 *
 * - The value itself, when it is a single line.
 * - Each line on its own, when it isn't. A multi-line `::add-mask::` only
 *   reliably masks its first line, and a PEM key or a JSON blob is exactly
 *   the multi-line secret that gets echoed line by line.
 * - Its base64 form, because "base64 it so the log doesn't mangle it" is a
 *   common debugging move and the runner does not derive that for us.
 * - Its JSON-escaped form when that differs, which is how a multi-line value
 *   appears once something serializes the environment.
 *
 * Whitespace-only fragments are dropped: masking a space would star every
 * space in the log and protects nothing.
 */
export function maskTargets(value: string): string[] {
  const targets = new Set<string>();
  const add = (s: string) => {
    if (s.trim().length > 0) targets.add(s);
  };

  const lines = value.split(/\r?\n/);
  if (lines.length === 1) add(value);
  else for (const line of lines) add(line.trim());

  if (value.trim().length > 0) {
    add(Buffer.from(value, "utf8").toString("base64"));
    const jsonEscaped = JSON.stringify(value).slice(1, -1);
    if (jsonEscaped !== value) add(jsonEscaped);
  }
  return [...targets];
}

/** The `::add-mask::` lines for a set of pairs, deduplicated across values. */
export function maskCommands(pairs: EnvPair[]): string[] {
  const seen = new Set<string>();
  for (const p of pairs) for (const t of maskTargets(p.value)) seen.add(t);
  return [...seen].map((t) => `::add-mask::${escapeData(t)}`);
}

/**
 * Registers every value with the runner's secret masker. Written straight to
 * stdout because that is the stream the runner parses for workflow commands,
 * and synchronously-ordered ahead of anything that could print a value.
 */
export function emitMasks(pairs: EnvPair[]): void {
  const lines = maskCommands(pairs);
  if (lines.length > 0) process.stdout.write(lines.join("\n") + "\n");
}

/**
 * One `NAME<<DELIM … DELIM` block for a file command. Always the heredoc
 * form, even for one-line values, so a value containing a newline can't
 * smuggle a second `NAME=value` line into the job's environment. The
 * delimiter is random and checked against the value for the same reason.
 */
export function fileCommandBlock(name: string, value: string): string {
  if (!name || /[=\r\n]/.test(name)) {
    throw new Error(`"${name}" can't be exported to GitHub Actions: names may not contain "=" or newlines.`);
  }
  let delimiter = `ghadelimiter_${randomUUID()}`;
  while (value.includes(delimiter)) delimiter = `ghadelimiter_${randomUUID()}`;
  return `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
}

/**
 * Appends pairs to the file the runner names in `variable` (`GITHUB_ENV` or
 * `GITHUB_OUTPUT`). One write, so a failure part-way can't leave half an
 * environment behind for the next step to run with.
 */
export async function appendFileCommand(variable: "GITHUB_ENV" | "GITHUB_OUTPUT", pairs: EnvPair[]): Promise<void> {
  const path = process.env[variable];
  if (!path) {
    throw new Error(`$${variable} isn't set — this format only works inside a GitHub Actions step.`);
  }
  await appendFile(path, pairs.map((p) => fileCommandBlock(p.key, p.value)).join(""), "utf8");
}
