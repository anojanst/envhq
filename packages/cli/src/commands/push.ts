import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { parseEnv } from "@envhq/parser";
import { readBase, writeBase } from "../base.ts";
import { computeThreeWayDiff } from "../sync.ts";
import { apiClient, ApiError, type EncryptedPair } from "../api.ts";
import { fail, confirmProdIfNeeded, confirmDeletions } from "../shared/ui.ts";
import { requireLink, resolveLinkedEnv } from "../shared/link.ts";
import { decryptPairs, encryptPairs, resolveDek } from "../shared/secrets.ts";

export function register(program: Command): void {
  program
    .command("push")
    .description("Upload a local file to the remote (upsert/merge).")
    .argument("[env]", "environment to push to (defaults to linked default; with --all, ignored)")
    .option("-f, --file <path>", "input file (overrides the linked mapping)")
    .option("--all", "push every linked environment from its mapped file", false)
    .option("--yes", "skip the production confirmation", false)
    .option("-m, --message <msg>", "commit message for this push")
    .action(
      async (
        envArg: string | undefined,
        opts: { file?: string; all: boolean; yes: boolean; message?: string },
      ) => {
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

            let raw: string;
            try {
              raw = await readFile(file, "utf8");
            } catch {
              fail(`Could not read ${file}.`);
            }

            const parsed = parseEnv(raw);
            if (parsed.length === 0) fail(`No valid KEY=value lines found in ${file}.`);

            // Always read live remote state first — the diff (and the CAS
            // version sent to /commit) are both computed against this same
            // fresh read, not the on-disk base, so a push never false-conflicts
            // just because the disk-cached version is behind reality.
            const { pairs: remoteEncrypted, version: remoteVersion } = await apiClient.exportEnv(env.id);
            const remotePairs = await decryptPairs(dek, remoteEncrypted);

            const base = await readBase(env.id);
            const { toUpsert, toDelete } = base
              ? computeThreeWayDiff(parsed, base.keys, remotePairs)
              : { toUpsert: parsed, toDelete: [] as string[] };

            if (toUpsert.length === 0 && toDelete.length === 0) {
              console.log(`No changes to push for ${env.name}.`);
              continue;
            }

            await confirmDeletions(toDelete, base?.keys.length ?? 0, opts.yes);

            let result: { version: number; created: number; updated: number; deleted: number };
            try {
              result = await apiClient.commit(env.id, {
                baseVersion: remoteVersion,
                upsert: await encryptPairs(dek, toUpsert),
                delete: toDelete,
                message: opts.message,
              });
            } catch (err) {
              if (err instanceof ApiError && err.status === 409) {
                const data = err.data as { currentVersion: number; serverPairs: EncryptedPair[] };
                const localValues = new Map(parsed.map((p) => [p.key, p.value]));
                const serverPairs = await decryptPairs(dek, data.serverPairs);
                console.error(
                  `✖ ${env.name} has moved to version ${data.currentVersion} since your last read. Conflicting keys:`,
                );
                for (const server of serverPairs) {
                  console.error(`  ${server.key}: yours="${localValues.get(server.key) ?? "(deleted)"}", server="${server.value}"`);
                }
                fail(`Run \`envhq pull\` to get the latest, then push again.`);
              }
              throw err;
            }

            await writeBase(env.id, {
              version: result.version,
              keys: parsed.map((p) => p.key).sort(),
            });

            console.log(
              `✔ Pushed to ${env.name} (v${result.version}): ${result.created} new, ${result.updated} updated, ${result.deleted} deleted.`,
            );
          }
        } catch (err) {
          fail(err instanceof ApiError ? err.message : String(err));
        }
      },
    );
}
