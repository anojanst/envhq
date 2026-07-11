import { Command } from "commander";
import { readFile, writeFile, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseEnv } from "@env-sync/parser";
import {
  readGlobalConfig,
  writeGlobalConfig,
  clearGlobalConfig,
  readLinkConfig,
  writeLinkConfig,
  DEFAULT_URL,
  LINK_FILENAME,
  CLI_VERSION,
  type LinkConfig,
} from "./config.ts";
import { apiClient, ApiError, type Environment } from "./api.ts";
import { runLoginFlow } from "./auth/login.ts";
import {
  storeSession,
  clearSession,
  resolveToken,
  keychainAvailable,
} from "./token-store.ts";

/** Whole days until an ISO timestamp (never negative). */
function daysUntil(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

const program = new Command();

program
  .name("envsync")
  .description("Sync your environment variables from the terminal.")
  .version(CLI_VERSION);

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function requireLink(): Promise<LinkConfig> {
  const link = await readLinkConfig();
  if (!link) fail(`This folder isn't linked. Run \`envsync link\` first.`);
  return link;
}

/** Resolve which environment id to act on, honouring a --env override by name. */
async function resolveEnvId(link: LinkConfig, override?: string): Promise<{ id: string; name: string }> {
  if (!override) return { id: link.environmentId, name: link.environmentName };
  const { environments } = await apiClient.getProject(link.projectId);
  const env = environments.find((e) => e.name === override);
  if (!env) fail(`No environment named "${override}" in project "${link.projectName}".`);
  return { id: env.id, name: env.name };
}

// ---- login ----
program
  .command("login")
  .description("Authenticate via your browser (or --token for CI).")
  .option("-t, --token <token>", "personal access token (headless / CI)")
  .option("-u, --url <url>", "API base url", DEFAULT_URL)
  .action(async (opts: { token?: string; url: string }) => {
    const url = opts.url.replace(/\/$/, "");
    try {
      // CI / headless: validate the provided PAT, then store it.
      if (opts.token) {
        const { userId } = await apiClient.me({ url, token: opts.token });
        storeSession(url, { token: opts.token });
        await writeGlobalConfig({ url });
        console.log(`✔ Logged in to ${url} (user ${userId}).`);
        return;
      }

      // Interactive: the token lands in the OS keychain, so require one up front.
      if (!keychainAvailable()) {
        fail(
          "No OS keychain is available to store your login securely.\n" +
            "Set ENVSYNC_TOKEN=<token> in your environment instead (recommended for CI).",
        );
      }

      const session = await runLoginFlow(url);
      storeSession(url, {
        token: session.token,
        expiresAt: session.expiresAt,
        userId: session.userId,
      });
      await writeGlobalConfig({ url });
      console.log(
        `✔ Logged in to ${url} (user ${session.userId}). Session valid for ${daysUntil(
          session.expiresAt,
        )} days.`,
      );
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- logout ----
program
  .command("logout")
  .description("Remove stored credentials.")
  .action(async () => {
    const config = await readGlobalConfig();
    if (config) clearSession(config.url);
    await clearGlobalConfig();
    console.log("✔ Logged out.");
  });

// ---- whoami ----
program
  .command("whoami")
  .description("Show the authenticated user.")
  .action(async () => {
    try {
      const { userId } = await apiClient.me();
      console.log(userId);
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- projects ----
program
  .command("projects")
  .description("List your projects.")
  .action(async () => {
    try {
      const { projects } = await apiClient.listProjects();
      if (projects.length === 0) return console.log("No projects yet.");
      for (const p of projects) console.log(`${p.name}  (${p.id})`);
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- link ----
program
  .command("link")
  .description("Link this folder to a project + environment.")
  .option("-p, --project <name>", "project name")
  .option("-e, --env <name>", "environment name")
  .action(async (opts: { project?: string; env?: string }) => {
    try {
      const { projects } = await apiClient.listProjects();
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

      let env: Environment | undefined = opts.env
        ? environments.find((e) => e.name === opts.env)
        : undefined;
      if (opts.env && !env) fail(`No environment named "${opts.env}" in "${project.name}".`);

      if (!env) {
        console.log("Environments:");
        environments.forEach((e, i) => console.log(`  ${i + 1}. ${e.name}`));
        const choice = Number(await prompt("Select an environment number: "));
        env = environments[choice - 1];
        if (!env) fail("Invalid selection.");
      }

      await writeLinkConfig({
        projectId: project.id,
        projectName: project.name,
        environmentId: env.id,
        environmentName: env.name,
      });
      console.log(`✔ Linked to ${project.name} / ${env.name} (wrote ${LINK_FILENAME}).`);
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- pull ----
program
  .command("pull")
  .description("Write remote variables to a local .env file.")
  .option("-e, --env <name>", "environment to pull (defaults to linked)")
  .option("-f, --file <path>", "output file", ".env")
  .option("--force", "overwrite without prompting", false)
  .action(async (opts: { env?: string; file: string; force: boolean }) => {
    try {
      const link = await requireLink();
      const env = await resolveEnvId(link, opts.env);
      const { content, count } = await apiClient.exportEnv(env.id);

      if ((await fileExists(opts.file)) && !opts.force) {
        const answer = await prompt(`${opts.file} exists. Overwrite? [y/N] `);
        if (answer.toLowerCase() !== "y") return console.log("Aborted.");
      }

      await writeFile(opts.file, content);
      console.log(`✔ Pulled ${count} variable${count === 1 ? "" : "s"} from ${env.name} → ${opts.file}`);
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- push ----
program
  .command("push")
  .description("Upload a local .env file to the remote (upsert/merge).")
  .option("-e, --env <name>", "environment to push to (defaults to linked)")
  .option("-f, --file <path>", "input file", ".env")
  .action(async (opts: { env?: string; file: string }) => {
    try {
      const link = await requireLink();
      const env = await resolveEnvId(link, opts.env);

      let raw: string;
      try {
        raw = await readFile(opts.file, "utf8");
      } catch {
        fail(`Could not read ${opts.file}.`);
      }

      const parsed = parseEnv(raw);
      if (parsed.length === 0) fail(`No valid KEY=value lines found in ${opts.file}.`);

      const res = await apiClient.importEnv(env.id, raw);
      console.log(
        `✔ Pushed to ${env.name}: ${res.created} new, ${res.updated} updated (${res.total} total).`,
      );
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- status ----
program
  .command("status")
  .description("Show login and link status for this folder.")
  .action(async () => {
    const global = await readGlobalConfig();
    const link = await readLinkConfig();

    if (!global) {
      console.log(`Logged in:  no (login would target ${DEFAULT_URL})`);
    } else {
      const resolved = resolveToken(global.url);
      if (!resolved) {
        console.log(`Logged in:  no token stored for ${global.url} (run \`envsync login\`)`);
      } else {
        const via = resolved.source === "env" ? "ENVSYNC_TOKEN" : "keychain";
        let suffix = ` (via ${via})`;
        if (resolved.expiresAt) {
          const days = daysUntil(resolved.expiresAt);
          suffix += days > 0 ? `, expires in ${days}d` : `, expired`;
        }
        console.log(`Logged in:  ${global.url}${suffix}`);
      }
    }

    console.log(
      link
        ? `Linked to:  ${link.projectName} / ${link.environmentName}`
        : `Linked to:  no (run \`envsync link\`)`,
    );
  });

program.parseAsync().catch((err) => fail(String(err)));
