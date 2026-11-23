import type { EnvPair } from "@envhq/parser";

/**
 * `--require` / `ENVHQ_REQUIRE` for `export` and `run`: the names a pipeline
 * can't work without.
 *
 * Loading an environment can't tell which of its variables the job reads, so
 * without this a typo (`HEL_ENVHC`) or a variable someone deleted in EnvHQ
 * reaches the job as an unset variable, and the job carries on with it.
 * Checked after decrypting and before anything is written or started, so a
 * failed check leaves nothing behind.
 */

/** Names separated by commas, whitespace or newlines (a YAML block scalar reads naturally). */
export function parseRequired(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).filter(Boolean))];
}

/**
 * Throws if any required name is missing or empty, naming every one of them.
 * Empty counts as missing: a blank DATABASE_URL breaks the job as surely as
 * an absent one. Only names appear in the message, never a value.
 */
export function checkRequired(pairs: EnvPair[], required: string[], where: string): void {
  if (required.length === 0) return;
  const values = new Map(pairs.map((p) => [p.key, p.value]));
  const problems: string[] = [];
  for (const name of required) {
    if (!values.has(name)) {
      const near = closest(name, [...values.keys()]);
      problems.push(near ? `${name} (did you mean ${near}?)` : name);
    } else if (values.get(name) === "") {
      problems.push(`${name} (set, but empty)`);
    }
  }
  if (problems.length === 0) return;
  const s = problems.length === 1 ? "" : "s";
  throw new Error(
    `${where} is missing ${problems.length} required variable${s}: ${problems.join(", ")}. ` +
      "Stopped before anything was written or run. Fix the name, or add the variable in EnvHQ.",
  );
}

/** The one existing name within a small edit distance — a likely typo — or undefined. */
function closest(name: string, names: string[]): string | undefined {
  // Longer names tolerate more slips: HEL_ENVHC is three edits from HELLO_ENVHQ.
  const limit = name.length <= 4 ? 1 : Math.max(2, Math.floor(name.length / 3));
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const candidate of names) {
    const d = distance(name.toUpperCase(), candidate.toUpperCase());
    if (d < bestDistance) [best, bestDistance] = [candidate, d];
  }
  return best;
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}
