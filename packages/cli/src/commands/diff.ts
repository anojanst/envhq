import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { parseEnv } from "@envhq/parser";
import { readBase } from "../base.ts";
import { computeThreeWayDiff } from "../sync.ts";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";
import { requireLink, resolveLinkedEnv } from "../shared/link.ts";
import { decryptPairs, resolveDek } from "../shared/secrets.ts";

export function register(program: Command): void {
  program
    .command("diff")
    .description("Preview what `push` would change, without applying it.")
    .argument("[env]", "environment to diff (defaults to linked default; with --all, ignored)")
    .option("-f, --file <path>", "input file (overrides the linked mapping)")
    .option("--all", "diff every linked environment against its mapped file", false)
    .action(async (envArg: string | undefined, opts: { file?: string; all: boolean }) => {
      try {
        const link = await requireLink();
        if (opts.all && envArg) fail("Pass either an environment or --all, not both.");
        if (opts.all && opts.file) fail("--file can't be combined with --all.");
        const { dek } = await resolveDek(link.projectId);

        const targets = opts.all
          ? Object.keys(link.environments).map((name) => resolveLinkedEnv(link, name))
          : [resolveLinkedEnv(link, envArg)];

        for (const env of targets) {
          const file = opts.file ?? env.file;

          let raw: string;
          try {
            raw = await readFile(file, "utf8");
          } catch {
            fail(`Could not read ${file}.`);
          }
          const parsed = parseEnv(raw);

          const base = await readBase(env.id);
          if (!base) {
            console.log(`${env.name}: no sync record yet — \`push\` would merge-only (no deletions).`);
            continue;
          }

          const { pairs: remoteEncrypted } = await apiClient.exportEnv(env.id);
          const remotePairs = await decryptPairs(dek, remoteEncrypted);
          const { toUpsert, toDelete } = computeThreeWayDiff(parsed, base.keys, remotePairs);

          if (toUpsert.length === 0 && toDelete.length === 0) {
            console.log(`${env.name}: no changes.`);
            continue;
          }

          console.log(`${env.name}:`);
          const baseSet = new Set(base.keys);
          for (const { key } of toUpsert) {
            console.log(`  ${baseSet.has(key) ? "~" : "+"} ${key}`);
          }
          for (const key of toDelete) {
            console.log(`  - ${key}`);
          }
          console.log(`  ${toUpsert.length} to push, ${toDelete.length} to delete.`);
        }
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
