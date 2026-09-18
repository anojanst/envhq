import type { Command } from "commander";
import { apiClient, ApiError } from "../api.ts";
import { fail, prompt, confirmProdIfNeeded } from "../shared/ui.ts";
import { requireLink, resolveLinkedEnv } from "../shared/link.ts";

export function register(program: Command): void {
  program
    .command("rollback")
    .description("Restore an environment to a previous version (creates a new version).")
    .argument("<version>", "version number to roll back to")
    .argument("[env]", "environment to roll back (defaults to linked default)")
    .option("--yes", "skip confirmation", false)
    .option("-m, --message <msg>", "commit message for the rollback")
    .action(
      async (
        versionArg: string,
        envArg: string | undefined,
        opts: { yes: boolean; message?: string },
      ) => {
        let envName = envArg ?? "environment";
        try {
          const link = await requireLink();
          const env = resolveLinkedEnv(link, envArg);
          envName = env.name;

          const version = Number(versionArg);
          if (!Number.isInteger(version) || version < 0) fail("version must be a non-negative integer.");

          await confirmProdIfNeeded(env.name, opts.yes);
          if (!opts.yes) {
            const answer = await prompt(
              `Roll back ${env.name} to v${version}? This creates a new version. [y/N] `,
            );
            if (answer.toLowerCase() !== "y") fail("Aborted.");
          }

          const { version: baseVersion } = await apiClient.exportEnv(env.id);
          const result = await apiClient.rollback(env.id, version, { baseVersion, message: opts.message });

          console.log(
            `✔ Rolled back ${env.name} to v${version} (new version: v${result.version}). Run \`envhq pull\` to update your local file.`,
          );
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const data = err.data as { currentVersion: number };
            fail(`${envName} changed since you last read it (now at version ${data.currentVersion}). Try again.`);
          }
          fail(err instanceof ApiError ? err.message : String(err));
        }
      },
    );
}
