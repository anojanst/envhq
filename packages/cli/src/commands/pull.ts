import type { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv, serializeEnv, type EnvPair } from "@envhq/parser";
import { readBase, writeBase } from "../base.ts";
import { apiClient, ApiError } from "../api.ts";
import { fail, prompt, confirmProdIfNeeded } from "../shared/ui.ts";
import { fileExists } from "../shared/fs.ts";
import { requireLink, resolveLinkedEnv } from "../shared/link.ts";
import { decryptPairs, resolveDek } from "../shared/secrets.ts";

export function register(program: Command): void {
  program
    .command("pull")
    .description("Write remote variables to a local file.")
    .argument("[env]", "environment to pull (defaults to linked default; with --all, ignored)")
    .option("-f, --file <path>", "output file (overrides the linked mapping)")
    .option("--all", "pull every linked environment to its mapped file", false)
    .option("--force", "overwrite without prompting", false)
    .option("--yes", "skip the production confirmation", false)
    .action(async (envArg: string | undefined, opts: { file?: string; all: boolean; force: boolean; yes: boolean }) => {
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
          await confirmProdIfNeeded(env.name, opts.yes);
          const { pairs, count, version: remoteVersion } = await apiClient.exportEnv(env.id);
          const remotePairs = await decryptPairs(dek, pairs);

          const exists = await fileExists(file);
          let localRaw: string | null = null;
          let localOnlyNew: EnvPair[] = [];

          if (exists) {
            localRaw = await readFile(file, "utf8");

            // Merge forward any local key that's never been synced (not in the
            // base, and not already on the remote under that name) instead of
            // silently discarding it — cloud still wins for every key it
            // already knows about, so this can never resurrect or clobber
            // anything remote. Value-only edits to an existing tracked key
            // aren't detectable here (the base stores key names only, never
            // values) — that's what the unconditional .bak below is for.
            const base = await readBase(env.id);
            const baseKeys = new Set(base?.keys ?? []);
            const remoteKeys = new Set(remotePairs.map((p) => p.key));
            localOnlyNew = parseEnv(localRaw).filter(
              (p) => !remoteKeys.has(p.key) && !baseKeys.has(p.key),
            );

            if (!opts.force) {
              const answer = await prompt(`${file} exists. Overwrite? [y/N] `);
              if (answer.toLowerCase() !== "y") {
                console.log(`Skipped ${env.name}.`);
                continue;
              }
            }
          }

          if (localRaw !== null) {
            await writeFile(`${file}.bak`, localRaw);
          }

          const merged = localOnlyNew.length > 0 ? [...remotePairs, ...localOnlyNew] : remotePairs;
          await writeFile(file, serializeEnv(merged));

          // Refresh the base from what was just pulled — pull is "cloud wins,"
          // so the base becomes exactly the remote's key set at the version the
          // server just reported. The merged-forward keys aren't actually
          // synced yet, so they deliberately stay out of the base; the next
          // `push` will pick them up as ordinary new local adds.
          const remoteKeys = remotePairs.map((p) => p.key).sort();
          await writeBase(env.id, { version: remoteVersion, keys: remoteKeys });

          const backupNote = localRaw !== null ? ` (backed up previous ${file} → ${file}.bak)` : "";
          const keptNote =
            localOnlyNew.length > 0
              ? ` — kept ${localOnlyNew.length} un-synced local key(s): ${localOnlyNew.map((p) => p.key).join(", ")}`
              : "";
          console.log(
            `✔ Pulled ${count} variable${count === 1 ? "" : "s"} from ${env.name} → ${file}${backupNote}${keptNote}.`,
          );
        }
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
