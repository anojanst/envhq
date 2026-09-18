import type { Command } from "commander";
import { basename } from "node:path";
import { readLinkConfig, writeLinkConfig, LINK_FILENAME } from "../config.ts";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";
import { ensureGitignored } from "../shared/fs.ts";
import { buildLinkConfig, describeLinkMapping } from "../shared/link.ts";
import { resolveOrgId } from "../shared/resolve.ts";

export function register(program: Command): void {
  program
    .command("init")
    .description("Bootstrap this folder: create a project, environment(s), and link it.")
    .argument("[name]", "project name (defaults to the folder name)")
    .option("-e, --env <names>", "comma-separated environment names", "dev")
    .option("--org <name>", "org to create the project in (defaults to your personal org)")
    .action(async (name: string | undefined, opts: { env: string; org?: string }) => {
      try {
        const existing = await readLinkConfig();
        if (existing) {
          return console.log(
            `Already linked to ${existing.projectName} (${LINK_FILENAME}). Nothing to do.`,
          );
        }

        const projectName = name ?? basename(process.cwd());
        const envNames = opts.env
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);

        const orgId = await resolveOrgId(opts);
        const { project, environments } = await apiClient.createProject(projectName, envNames, orgId);
        console.log(`✔ Created project "${project.name}" (${environments.map((e) => e.name).join(", ")}).`);

        const link = buildLinkConfig(project, environments);
        await writeLinkConfig(link);
        await ensureGitignored();
        console.log(`✔ Linked (${describeLinkMapping(link)}). Default: ${link.default}.`);
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
