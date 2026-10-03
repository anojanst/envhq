import { apiClient, ApiError, type Environment } from "../api.ts";
import { readLinkConfig } from "../config.ts";
import { fail } from "./ui.ts";
import { resolveLinkedEnv } from "./link.ts";

export interface Target {
  projectId: string;
  projectName: string;
  envId: string;
  envName: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The environment `run`/`export` read from.
 *
 * Unlike `pull`, these must work on a CI runner with no linked folder, so an
 * explicit `--project` (a name or an id) wins over the link. A name is looked
 * up across every org the token can see — a deploy key's token is scoped to
 * one project, so that is a short search — and an ambiguous name is refused
 * rather than guessed at, because guessing picks *some* environment's secrets.
 */
export async function resolveTarget(opts: { project?: string; env?: string }): Promise<Target> {
  if (!opts.project) {
    const link = await readLinkConfig();
    if (!link) {
      fail("No project given. Pass --project (or set ENVHQ_PROJECT), or run this in a linked folder.");
    }
    const env = resolveLinkedEnv(link, opts.env);
    return { projectId: link.projectId, projectName: link.projectName, envId: env.id, envName: env.name };
  }

  const projectId = UUID_RE.test(opts.project) ? opts.project : await findProjectIdByName(opts.project);

  let detail: { project: { id: string; name: string }; environments: Environment[] };
  try {
    detail = await apiClient.getProject(projectId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      fail(`No project "${opts.project}" that this token can read.`);
    }
    throw err;
  }

  if (!opts.env) {
    fail(
      `No environment given. Pass --env (or set ENVHQ_ENVIRONMENT). ` +
        `${detail.project.name} has: ${detail.environments.map((e) => e.name).join(", ")}.`,
    );
  }
  const env = detail.environments.find((e) => e.name === opts.env || e.id === opts.env);
  if (!env) {
    fail(
      `No environment named "${opts.env}" in ${detail.project.name}. ` +
        `It has: ${detail.environments.map((e) => e.name).join(", ")}.`,
    );
  }
  return { projectId: detail.project.id, projectName: detail.project.name, envId: env.id, envName: env.name };
}

async function findProjectIdByName(name: string): Promise<string> {
  const { orgs } = await apiClient.listOrgs();
  const matches: { id: string; org: string }[] = [];
  for (const org of orgs) {
    const { projects } = await apiClient.listProjects(org.id);
    for (const p of projects) if (p.name === name) matches.push({ id: p.id, org: org.name });
  }
  if (matches.length === 0) fail(`No project named "${name}" that this token can read.`);
  if (matches.length > 1) {
    fail(
      `More than one project is named "${name}" (in ${matches.map((m) => m.org).join(", ")}). ` +
        `Pass its id instead: ${matches.map((m) => m.id).join(", ")}.`,
    );
  }
  return matches[0]!.id;
}
