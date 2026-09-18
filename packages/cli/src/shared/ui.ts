import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Terminal I/O and the confirmation prompts that guard destructive syncs.
 * Extracted from index.ts unchanged — every command's error path goes through
 * `fail`, so its exit-code behaviour is load-bearing.
 */

/** Whole days until an ISO timestamp (never negative). */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

export async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export const PROD_NAME_RE = /^prod(uction)?$/i;

/** Extra confirmation before writing to an environment that looks like production. */
export async function confirmProdIfNeeded(envName: string, yes: boolean): Promise<void> {
  if (!PROD_NAME_RE.test(envName) || yes) return;
  const answer = await prompt(`⚠ "${envName}" looks like production. Continue? [y/N] `);
  if (answer.toLowerCase() !== "y") fail("Aborted.");
}

/**
 * Confirm before a three-way push deletes remote keys. Extra warning if
 * deleting over half of what the base tracks — a stale/partial local file is
 * the most likely cause of an unexpectedly large delete set.
 */
export async function confirmDeletions(
  toDelete: string[],
  baseKeyCount: number,
  yes: boolean,
): Promise<void> {
  if (toDelete.length === 0 || yes) return;
  const pct = baseKeyCount > 0 ? toDelete.length / baseKeyCount : 0;
  const warning = pct > 0.5 ? ` ⚠ that's over half of the ${baseKeyCount} tracked keys.` : "";
  const answer = await prompt(
    `This will delete ${toDelete.length} key(s) remotely: ${toDelete.join(", ")}.${warning} Continue? [y/N] `,
  );
  if (answer.toLowerCase() !== "y") fail("Aborted.");
}
