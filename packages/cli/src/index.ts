import { Command } from "commander";
import { readFile, writeFile, appendFile, access } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { basename } from "node:path";
import { parseEnv, serializeEnv } from "@envhq/parser";
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
import { readBase, writeBase } from "./base.ts";
import { computeThreeWayDiff } from "./sync.ts";
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
  .name("envhq")
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
  if (!link) fail(`This folder isn't linked. Run \`envhq link\` first.`);
  return link;
}

/** Default local file for an environment name (default env → .env, others → .env.<name>). */
function defaultFileFor(name: string, defaultName: string): string {
  return name === defaultName ? ".env" : `.env.${name}`;
}

/** Build a link config mapping every environment to its default file. */
function buildLinkConfig(
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

function describeLinkMapping(link: LinkConfig): string {
  return Object.entries(link.environments)
    .map(([name, e]) => `${name} → ${e.file}`)
    .join(", ");
}

/** Add `.envhq/` to .gitignore if it isn't already covered (idempotent). */
async function ensureGitignored(cwd = process.cwd()): Promise<void> {
  const path = `${cwd}/.gitignore`;
  const existing = (await fileExists(path)) ? await readFile(path, "utf8") : "";
  if (existing.split("\n").some((line) => line.trim() === ".envhq/")) return;
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(path, `${prefix}.envhq/\n`);
}

/** Resolve an env name (or the link's default) to its id + mapped local file. */
function resolveLinkedEnv(link: LinkConfig, name?: string): { name: string; id: string; file: string } {
  const envName = name ?? link.default;
  const env = link.environments[envName];
  if (!env) {
    fail(
      `No environment named "${envName}" linked in this folder. Linked: ${Object.keys(link.environments).join(", ")}.`,
    );
  }
  return { name: envName, ...env };
}

/** Resolve the target project: --project <name> looks it up, else the linked project. */
async function resolveProject(opts: { project?: string }): Promise<{ id: string; name: string }> {
  if (opts.project) {
    const { projects } = await apiClient.listProjects();
    const project = projects.find((p) => p.name === opts.project);
    if (!project) fail(`No project named "${opts.project}".`);
    return project;
  }
  const link = await requireLink();
  return { id: link.projectId, name: link.projectName };
}

const PROD_NAME_RE = /^prod(uction)?$/i;

/** Extra confirmation before writing to an environment that looks like production. */
async function confirmProdIfNeeded(envName: string, yes: boolean): Promise<void> {
  if (!PROD_NAME_RE.test(envName) || yes) return;
  const answer = await prompt(`⚠ "${envName}" looks like production. Continue? [y/N] `);
  if (answer.toLowerCase() !== "y") fail("Aborted.");
}

/**
 * Confirm before a three-way push deletes remote keys. Extra warning if
 * deleting over half of what the base tracks — a stale/partial local file is
 * the most likely cause of an unexpectedly large delete set.
 */
async function confirmDeletions(toDelete: string[], baseKeyCount: number, yes: boolean): Promise<void> {
  if (toDelete.length === 0 || yes) return;
  const pct = baseKeyCount > 0 ? toDelete.length / baseKeyCount : 0;
  const warning = pct > 0.5 ? ` ⚠ that's over half of the ${baseKeyCount} tracked keys.` : "";
  const answer = await prompt(
    `This will delete ${toDelete.length} key(s) remotely: ${toDelete.join(", ")}.${warning} Continue? [y/N] `,
  );
  if (answer.toLowerCase() !== "y") fail("Aborted.");
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
            "Set ENVHQ_TOKEN=<token> in your environment instead (recommended for CI).",
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
const projectsCommand = program
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
  .description("Link this folder to a project, mapping every environment to a local file.")
  .option("-p, --project <name>", "project name")
  .action(async (opts: { project?: string }) => {
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

      const link = buildLinkConfig(project, environments);
      await writeLinkConfig(link);
      console.log(`✔ Linked to ${project.name} (${describeLinkMapping(link)}). Default: ${link.default}.`);
      console.log(`  Wrote ${LINK_FILENAME}. Adjust a mapping with \`envhq env map <env> <file>\`.`);
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- projects create ----
projectsCommand
  .command("create")
  .description("Create a new project (and dev environment) and link this folder to it.")
  .argument("<name>", "project name")
  .option("-e, --env <names>", "comma-separated environment names", "dev")
  .option("--no-link", "don't link this folder to the new project")
  .action(async (name: string, opts: { env: string; link: boolean }) => {
    try {
      const envNames = opts.env
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      const { project, environments } = await apiClient.createProject(name, envNames);
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

// ---- init ----
program
  .command("init")
  .description("Bootstrap this folder: create a project, environment(s), and link it.")
  .argument("[name]", "project name (defaults to the folder name)")
  .option("-e, --env <names>", "comma-separated environment names", "dev")
  .action(async (name: string | undefined, opts: { env: string }) => {
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

      const { project, environments } = await apiClient.createProject(projectName, envNames);
      console.log(`✔ Created project "${project.name}" (${environments.map((e) => e.name).join(", ")}).`);

      const link = buildLinkConfig(project, environments);
      await writeLinkConfig(link);
      await ensureGitignored();
      console.log(`✔ Linked (${describeLinkMapping(link)}). Default: ${link.default}.`);
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- env ----
const envCommand = program.command("env").description("Manage environments and their file mappings.");

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

// ---- env create ----
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

// ---- env list ----
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

// ---- pull ----
program
  .command("pull")
  .description("Write remote variables to a local file.")
  .argument("[env]", "environment to pull (defaults to linked default; with --all, ignored)")
  .option("-f, --file <path>", "output file (overrides the linked mapping)")
  .option("--all", "pull every linked environment to its mapped file", false)
  .option("--force", "overwrite without prompting", false)
  .option("--yes", "skip the production confirmation", false)
  .action(async (envArg: string | undefined, opts: { file?: string; all: boolean; force: boolean; yes: boolean }) => {
    try {
      const link = await requireLink();
      if (opts.all && envArg) fail("Pass either an environment or --all, not both.");
      if (opts.all && opts.file) fail("--file can't be combined with --all.");

      const targets = opts.all
        ? Object.keys(link.environments).map((name) => resolveLinkedEnv(link, name))
        : [resolveLinkedEnv(link, envArg)];

      for (const env of targets) {
        const file = opts.file ?? env.file;
        await confirmProdIfNeeded(env.name, opts.yes);
        const { content, count } = await apiClient.exportEnv(env.id);

        const exists = await fileExists(file);
        let localRaw: string | null = null;
        if (exists) {
          localRaw = await readFile(file, "utf8");

          if (!opts.force) {
            // Non-clobbering check: if the local file's key set has drifted
            // from what was last synced, pulling now would silently discard
            // local additions/removals — refuse instead of overwriting.
            // (Key-set only — a value edited in place without adding or
            // removing a key isn't detectable from the base, which stores
            // names only; the unconditional .bak below is the safety net for
            // that case.)
            const base = await readBase(env.id);
            if (base) {
              const localKeys = parseEnv(localRaw).map((p) => p.key).sort();
              const baseKeys = [...base.keys].sort();
              if (JSON.stringify(localKeys) !== JSON.stringify(baseKeys)) {
                fail(
                  `${file} has local changes that don't match the last sync for ${env.name} ` +
                    `(keys differ from the last known set) — push first, or re-run with --force to overwrite anyway.`,
                );
              }
            }

            const answer = await prompt(`${file} exists. Overwrite? [y/N] `);
            if (answer.toLowerCase() !== "y") {
              console.log(`Skipped ${env.name}.`);
              continue;
            }
          }
        }

        if (localRaw !== null) {
          await writeFile(`${file}.bak`, localRaw);
        }
        await writeFile(file, content);

        // Refresh the base from what was just pulled — pull is "cloud wins,"
        // so the base becomes exactly the remote's key set.
        const base = await readBase(env.id);
        const remoteKeys = parseEnv(content)
          .map((p) => p.key)
          .sort();
        await writeBase(env.id, { version: (base?.version ?? 0) + 1, keys: remoteKeys });

        const backupNote = localRaw !== null ? ` (backed up previous ${file} → ${file}.bak)` : "";
        console.log(
          `✔ Pulled ${count} variable${count === 1 ? "" : "s"} from ${env.name} → ${file}${backupNote}.`,
        );
      }
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- push ----
program
  .command("push")
  .description("Upload a local file to the remote (upsert/merge).")
  .argument("[env]", "environment to push to (defaults to linked default; with --all, ignored)")
  .option("-f, --file <path>", "input file (overrides the linked mapping)")
  .option("--all", "push every linked environment from its mapped file", false)
  .option("--yes", "skip the production confirmation", false)
  .action(async (envArg: string | undefined, opts: { file?: string; all: boolean; yes: boolean }) => {
    try {
      const link = await requireLink();
      if (opts.all && envArg) fail("Pass either an environment or --all, not both.");
      if (opts.all && opts.file) fail("--file can't be combined with --all.");

      const targets = opts.all
        ? Object.keys(link.environments).map((name) => resolveLinkedEnv(link, name))
        : [resolveLinkedEnv(link, envArg)];

      for (const env of targets) {
        const file = opts.file ?? env.file;
        await confirmProdIfNeeded(env.name, opts.yes);

        let raw: string;
        try {
          raw = await readFile(file, "utf8");
        } catch {
          fail(`Could not read ${file}.`);
        }

        const parsed = parseEnv(raw);
        if (parsed.length === 0) fail(`No valid KEY=value lines found in ${file}.`);

        const base = await readBase(env.id);

        if (!base) {
          // No sync record (never pushed/pulled, or the base was lost) —
          // degrade to the old merge-only behavior: upsert everything, delete
          // nothing, then start tracking a base from here on.
          const res = await apiClient.importEnv(env.id, raw);
          await writeBase(env.id, { version: 1, keys: parsed.map((p) => p.key).sort() });
          console.log(
            `✔ Pushed to ${env.name}: ${res.created} new, ${res.updated} updated (merge-only — no sync record found).`,
          );
          continue;
        }

        const { content: remoteContent } = await apiClient.exportEnv(env.id);
        const remotePairs = parseEnv(remoteContent);
        const { toUpsert, toDelete } = computeThreeWayDiff(parsed, base.keys, remotePairs);

        await confirmDeletions(toDelete, base.keys.length, opts.yes);

        let created = 0;
        let updated = 0;
        if (toUpsert.length > 0) {
          const res = await apiClient.importEnv(env.id, serializeEnv(toUpsert));
          created = res.created;
          updated = res.updated;
        }
        let deleted = 0;
        if (toDelete.length > 0) {
          const res = await apiClient.deleteKeys(env.id, toDelete);
          deleted = res.deleted;
        }

        await writeBase(env.id, {
          version: base.version + 1,
          keys: parsed.map((p) => p.key).sort(),
        });

        console.log(
          `✔ Pushed to ${env.name}: ${created} new, ${updated} updated, ${deleted} deleted.`,
        );
      }
    } catch (err) {
      fail(err instanceof ApiError ? err.message : String(err));
    }
  });

// ---- diff ----
program
  .command("diff")
  .description("Preview what `push` would change, without applying it.")
  .argument("[env]", "environment to diff (defaults to linked default; with --all, ignored)")
  .option("-f, --file <path>", "input file (overrides the linked mapping)")
  .option("--all", "diff every linked environment against its mapped file", false)
  .action(async (envArg: string | undefined, opts: { file?: string; all: boolean }) => {
    try {
      const link = await requireLink();
      if (opts.all && envArg) fail("Pass either an environment or --all, not both.");
      if (opts.all && opts.file) fail("--file can't be combined with --all.");

      const targets = opts.all
        ? Object.keys(link.environments).map((name) => resolveLinkedEnv(link, name))
        : [resolveLinkedEnv(link, envArg)];

      for (const env of targets) {
        const file = opts.file ?? env.file;

        let raw: string;
        try {
          raw = await readFile(file, "utf8");
        } catch {
          fail(`Could not read ${file}.`);
        }
        const parsed = parseEnv(raw);

        const base = await readBase(env.id);
        if (!base) {
          console.log(`${env.name}: no sync record yet — \`push\` would merge-only (no deletions).`);
          continue;
        }

        const { content: remoteContent } = await apiClient.exportEnv(env.id);
        const remotePairs = parseEnv(remoteContent);
        const { toUpsert, toDelete } = computeThreeWayDiff(parsed, base.keys, remotePairs);

        if (toUpsert.length === 0 && toDelete.length === 0) {
          console.log(`${env.name}: no changes.`);
          continue;
        }

        console.log(`${env.name}:`);
        const baseSet = new Set(base.keys);
        for (const { key } of toUpsert) {
          console.log(`  ${baseSet.has(key) ? "~" : "+"} ${key}`);
        }
        for (const key of toDelete) {
          console.log(`  - ${key}`);
        }
        console.log(`  ${toUpsert.length} to push, ${toDelete.length} to delete.`);
      }
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
        console.log(`Logged in:  no token stored for ${global.url} (run \`envhq login\`)`);
      } else {
        const via = resolved.source === "env" ? "ENVHQ_TOKEN" : "keychain";
        let suffix = ` (via ${via})`;
        if (resolved.expiresAt) {
          const days = daysUntil(resolved.expiresAt);
          suffix += days > 0 ? `, expires in ${days}d` : `, expired`;
        }
        console.log(`Logged in:  ${global.url}${suffix}`);
      }
    }

    if (!link) {
      console.log(`Linked to:  no (run \`envhq link\`)`);
    } else {
      console.log(`Linked to:  ${link.projectName}`);
      for (const [name, env] of Object.entries(link.environments)) {
        const marker = name === link.default ? "*" : " ";
        console.log(`  ${marker} ${name} → ${env.file}`);
      }
    }
  });

program.parseAsync().catch((err) => fail(String(err)));
