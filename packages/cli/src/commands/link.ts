import type { Command } from "commander";
import { writeLinkConfig, LINK_FILENAME } from "../config.ts";
import { apiClient, ApiError } from "../api.ts";
import { fail, prompt } from "../shared/ui.ts";
import { buildLinkConfig, describeLinkMapping } from "../shared/link.ts";
import { resolveOrgId } from "../shared/resolve.ts";

export function register(program: Command): void {
  program
    .command("link")
    .description("Link this folder to a project, mapping every environment to a local file.")
    .option("-p, --project <name>", "project name")
    .option("--org <name>", "org to pick the project from (defaults to your personal org)")
    .action(async (opts: { project?: string; org?: string }) => {
      try {
        const orgId = await resolveOrgId(opts);
        const { projects } = await apiClient.listProjects(orgId);
        if (projects.length === 0) fail("You have no projects yet. Create one in the web app.");

        let project = opts.project
          ? projects.find((p) => p.name === opts.project)
          : undefined;
        if (opts.project && !project) fail(`No project named "${opts.project}".`);

        if (!project) {
          console.log("Projects:");
          projects.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
          const choice = Number(await prompt("Select a project number: "));
          project = projects[choice - 1];
          if (!project) fail("Invalid selection.");
        }

        const { environments } = await apiClient.getProject(project.id);
        if (environments.length === 0) fail(`Project "${project.name}" has no environments yet.`);

        const link = buildLinkConfig(project, environments);
        await writeLinkConfig(link);
        console.log(`✔ Linked to ${project.name} (${describeLinkMapping(link)}). Default: ${link.default}.`);
        console.log(`  Wrote ${LINK_FILENAME}. Adjust a mapping with \`envhq env map <env> <file>\`.`);
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
