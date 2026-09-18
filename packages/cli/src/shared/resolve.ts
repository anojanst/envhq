import { apiClient } from "../api.ts";
import { fail } from "./ui.ts";
import { requireLink } from "./link.ts";

/** Resolve --org <name> to an org id via a case-insensitive name match, or undefined (server defaults to the personal org). */
export async function resolveOrgId(opts: { org?: string }): Promise<string | undefined> {
  if (!opts.org) return undefined;
  const { orgs } = await apiClient.listOrgs();
  const org = orgs.find((o) => o.name.toLowerCase() === opts.org!.toLowerCase());
  if (!org) fail(`No org named "${opts.org}". Run \`envhq orgs\` to see your orgs.`);
  return org.id;
}

/** Resolve the target project: --project <name> (optionally scoped by --org) looks it up, else the linked project. */
export async function resolveProject(opts: {
  project?: string;
  org?: string;
}): Promise<{ id: string; name: string }> {
  if (opts.project) {
    const orgId = await resolveOrgId(opts);
    const { projects } = await apiClient.listProjects(orgId);
    const project = projects.find((p) => p.name === opts.project);
    if (!project) fail(`No project named "${opts.project}".`);
    return project;
  }
  const link = await requireLink();
  return { id: link.projectId, name: link.projectName };
}
