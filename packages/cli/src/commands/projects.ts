import type { Command } from "commander";
import { writeLinkConfig } from "../config.ts";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";
import { ensureGitignored } from "../shared/fs.ts";
import { buildLinkConfig, describeLinkMapping } from "../shared/link.ts";
import { resolveOrgId } from "../shared/resolve.ts";

/** `projects` lists, and carries `projects create` as a subcommand. */
export function register(program: Command): void {
  const projectsCommand = program
    .command("projects")
    .description("List your projects.")
    .option("--org <name>", "org to list projects from (defaults to your personal org)")
    .action(async (opts: { org?: string }) => {
      try {
        const orgId = await resolveOrgId(opts);
        const { projects } = await apiClient.listProjects(orgId);
        if (projects.length === 0) return console.log("No projects yet.");
        for (const p of projects) console.log(`${p.name}  (${p.id})`);
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });

  projectsCommand
    .command("create")
    .description("Create a new project (and dev environment) and link this folder to it.")
    .argument("<name>", "project name")
    .option("-e, --env <names>", "comma-separated environment names", "dev")
    .option("--org <name>", "org to create the project in (defaults to your personal org)")
    .option("--no-link", "don't link this folder to the new project")
    .action(async (name: string, opts: { env: string; org?: string; link: boolean }) => {
      try {
        const envNames = opts.env
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean);
        const orgId = await resolveOrgId(opts);
        const { project, environments } = await apiClient.createProject(name, envNames, orgId);
        console.log(`✔ Created project "${project.name}" (${environments.map((e) => e.name).join(", ")}).`);

        if (opts.link) {
          const link = buildLinkConfig(project, environments);
          await writeLinkConfig(link);
          await ensureGitignored();
          console.log(`✔ Linked (${describeLinkMapping(link)}). Default: ${link.default}.`);
        }
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
