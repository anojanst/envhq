import type { Command } from "commander";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";
import { requireLink, resolveLinkedEnv } from "../shared/link.ts";

export function register(program: Command): void {
  program
    .command("history")
    .description("Show version history for an environment.")
    .argument("[env]", "environment to show history for (defaults to linked default; with --all, ignored)")
    .option("--all", "show history for every linked environment", false)
    .action(async (envArg: string | undefined, opts: { all: boolean }) => {
      try {
        const link = await requireLink();
        if (opts.all && envArg) fail("Pass either an environment or --all, not both.");

        const targets = opts.all
          ? Object.keys(link.environments).map((name) => resolveLinkedEnv(link, name))
          : [resolveLinkedEnv(link, envArg)];

        for (const env of targets) {
          const { versions } = await apiClient.listVersions(env.id);
          console.log(`${env.name}:`);
          if (versions.length === 0) {
            console.log("  (no history yet)");
            continue;
          }
          for (const v of versions) {
            const msg = v.message ? `  ${v.message}` : "";
            console.log(`  v${v.version}  ${v.createdAt}  ${v.createdByName}${msg}`);
          }
        }
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
