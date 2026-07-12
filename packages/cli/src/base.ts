import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * The "base" is the CLI's last-known-synced record for one environment: the
 * key *names* it saw last time it pushed or pulled (never values — see
 * PLAN.md §1 invariant #2). It's what makes a three-way push possible: a key
 * removed from the base but still present locally was deliberately kept, a
 * key removed from local but still in the base was deliberately deleted, and
 * a remote key never in the base has never been seen by this client and is
 * left alone.
 *
 * One file per environment (keyed by environment id, not by the mapped local
 * file — PLAN.md §1 invariant #1). Lives under `.envhq/`, so it's already
 * covered by the `.gitignore` entry `ensureGitignored()` writes.
 *
 * Missing/unreadable is a normal state (never synced yet, or the file was
 * deleted) — callers degrade to a plain merge-only push (invariant #3).
 */

const BASE_DIR = ".envhq/base";

export interface Base {
  /**
   * A CLI-local counter, bumped on every write. Placeholder for M4's
   * server-side compare-and-swap version — not used for any logic yet.
   */
  version: number;
  keys: string[];
}

function baseFilePath(environmentId: string, cwd: string): string {
  return join(cwd, BASE_DIR, `${environmentId}.json`);
}

export async function readBase(environmentId: string, cwd = process.cwd()): Promise<Base | null> {
  try {
    return JSON.parse(await readFile(baseFilePath(environmentId, cwd), "utf8")) as Base;
  } catch {
    return null;
  }
}

export async function writeBase(
  environmentId: string,
  base: Base,
  cwd = process.cwd(),
): Promise<void> {
  await mkdir(join(cwd, BASE_DIR), { recursive: true });
  await writeFile(baseFilePath(environmentId, cwd), JSON.stringify(base, null, 2) + "\n");
}
