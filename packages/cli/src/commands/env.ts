import type { Command } from "commander";
import { readLinkConfig, writeLinkConfig, type LinkConfig } from "../config.ts";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";
import { requireLink, defaultFileFor } from "../shared/link.ts";
import { resolveProject } from "../shared/resolve.ts";

/** The `env` group: map, create and list, registered in that order. */
export function register(program: Command): void {
  const envCommand = program
    .command("env")
    .description("Manage environments and their file mappings.");

  envCommand
    .command("map")
    .description("Change which local file an environment maps to.")
    .argument("<env>", "environment name")
    .argument("<file>", "local file to map it to")
    .action(async (envName: string, file: string) => {
      const link = await requireLink();
      if (!link.environments[envName]) {
        fail(`No environment named "${envName}" linked. Linked: ${Object.keys(link.environments).join(", ")}.`);
      }
      link.environments[envName] = { ...link.environments[envName], file };
      await writeLinkConfig(link);
      console.log(`✔ ${envName} → ${file}`);
    });

  envCommand
    .command("create")
    .description("Create an environment (optionally cloning another) in a project.")
    .argument("<name>", "environment name")
    .option("-p, --project <name>", "project name (defaults to the linked project)")
    .option("--from <env>", "clone variables from this existing environment")
    .option("--link", "link this folder to the new environment", false)
    .action(async (name: string, opts: { project?: string; from?: string; link: boolean }) => {
      try {
        const project = await resolveProject(opts);

        let fromId: string | undefined;
        if (opts.from) {
          const { environments } = await apiClient.getProject(project.id);
          const source = environments.find((e) => e.name === opts.from);
          if (!source) fail(`No environment named "${opts.from}" in "${project.name}".`);
          fromId = source.id;
        }

        const { environment } = await apiClient.createEnvironment(project.id, name, fromId);
        console.log(
          `✔ Created environment "${environment.name}"${opts.from ? ` (cloned from ${opts.from})` : ""} in ${project.name}.`,
        );

        if (opts.link) {
          const existing = await readLinkConfig();
          const link: LinkConfig =
            existing && existing.projectId === project.id
              ? existing
              : { projectId: project.id, projectName: project.name, environments: {}, default: environment.name };
          link.environments[environment.name] = {
            id: environment.id,
            file: defaultFileFor(environment.name, link.default),
          };
          await writeLinkConfig(link);
          console.log(`✔ Linked ${environment.name} → ${link.environments[environment.name].file}.`);
        }
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });

  envCommand
    .command("list")
    .description("List environments in a project.")
    .option("-p, --project <name>", "project name (defaults to the linked project)")
    .action(async (opts: { project?: string }) => {
      try {
        const project = await resolveProject(opts);
        const { environments } = await apiClient.getProject(project.id);
        if (environments.length === 0) return console.log(`No environments in "${project.name}".`);

        const link = await readLinkConfig();
        const linkedHere = link?.projectId === project.id ? link : undefined;
        for (const e of environments) {
          const mapped = linkedHere?.environments[e.name];
          const marker = mapped && linkedHere!.default === e.name ? "*" : " ";
          console.log(`  ${marker} ${e.name}${mapped ? ` → ${mapped.file}` : ""}`);
        }
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
