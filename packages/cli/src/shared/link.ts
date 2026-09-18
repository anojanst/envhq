import { readLinkConfig, type LinkConfig } from "../config.ts";
import type { Environment } from "../api.ts";
import { fail } from "./ui.ts";

/** The linked project for this folder, or exit telling the user to link first. */
export async function requireLink(): Promise<LinkConfig> {
  const link = await readLinkConfig();
  if (!link) fail(`This folder isn't linked. Run \`envhq link\` first.`);
  return link;
}

/** Default local file for an environment name (default env → .env, others → .env.<name>). */
export function defaultFileFor(name: string, defaultName: string): string {
  return name === defaultName ? ".env" : `.env.${name}`;
}

/** Build a link config mapping every environment to its default file. */
export function buildLinkConfig(
  project: { id: string; name: string },
  environments: Environment[],
): LinkConfig {
  const defaultName = environments.find((e) => e.name === "dev")?.name ?? environments[0].name;
  const envMap: LinkConfig["environments"] = {};
  for (const env of environments) {
    envMap[env.name] = { id: env.id, file: defaultFileFor(env.name, defaultName) };
  }
  return { projectId: project.id, projectName: project.name, environments: envMap, default: defaultName };
}

export function describeLinkMapping(link: LinkConfig): string {
  return Object.entries(link.environments)
    .map(([name, e]) => `${name} → ${e.file}`)
    .join(", ");
}

/** Resolve an env name (or the link's default) to its id + mapped local file. */
export function resolveLinkedEnv(
  link: LinkConfig,
  name?: string,
): { name: string; id: string; file: string } {
  const envName = name ?? link.default;
  const env = link.environments[envName];
  if (!env) {
    fail(
      `No environment named "${envName}" linked in this folder. Linked: ${Object.keys(link.environments).join(", ")}.`,
    );
  }
  return { name: envName, ...env };
}
