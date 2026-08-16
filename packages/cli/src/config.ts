import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";

/**
 * Two config files:
 *   - Global config (~/.envhq/config.json): the API url only. The secret token
 *     lives in the OS keychain (see token-store.ts), never on disk.
 *   - Project link (./.envhq/config.json): which project this folder maps to,
 *     and the per-environment file mapping, so `pull`/`push` need no arguments.
 */

const GLOBAL_DIR = join(homedir(), ".envhq");
const GLOBAL_FILE = join(GLOBAL_DIR, "config.json");
const LINK_DIR = ".envhq";
const LINK_FILE = join(LINK_DIR, "config.json");
/** Pre-rebrand (envsync) link dir/file, auto-migrated into LINK_FILE on first read. */
const LEGACY_LINK_DIR = ".envsync";
const LEGACY_LINK_FILE = join(LEGACY_LINK_DIR, "config.json");
/** Pre-M2 single-env link file, older still than LEGACY_LINK_FILE. */
const LEGACY_SINGLE_ENV_FILE = ".envsync.json";

export interface GlobalConfig {
  url: string;
  /**
   * @deprecated Legacy plaintext token from pre-keychain versions. Still read so
   * we can migrate it into the OS keychain on first use, then strip it.
   */
  token?: string;
}

export interface EnvLink {
  id: string;
  file: string;
}

export interface LinkConfig {
  projectId: string;
  projectName: string;
  /** Environment name → { id, local file }. */
  environments: Record<string, EnvLink>;
  /** Name of the environment `push`/`pull` target when none is given. */
  default: string;
}

interface LegacySingleEnvConfig {
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readGlobalConfig(): Promise<GlobalConfig | null> {
  return readJson<GlobalConfig>(GLOBAL_FILE);
}

export async function writeGlobalConfig(config: GlobalConfig): Promise<void> {
  await mkdir(GLOBAL_DIR, { recursive: true });
  // Persist url only — never write the token back to disk.
  const { url } = config;
  await writeFile(GLOBAL_FILE, JSON.stringify({ url }, null, 2) + "\n", { mode: 0o600 });
}

export async function clearGlobalConfig(): Promise<void> {
  await rm(GLOBAL_FILE, { force: true });
}

export async function readLinkConfig(cwd = process.cwd()): Promise<LinkConfig | null> {
  const current = await readJson<LinkConfig>(join(cwd, LINK_FILE));
  if (current) return current;

  // Auto-migrate the pre-rebrand `.envsync/config.json` (same shape) into
  // `.envhq/config.json`.
  const legacy = await readJson<LinkConfig>(join(cwd, LEGACY_LINK_FILE));
  if (legacy) {
    await writeLinkConfig(legacy, cwd);
    await rm(join(cwd, LEGACY_LINK_DIR), { recursive: true, force: true });
    console.error(`✔ Migrated ${LEGACY_LINK_FILE} → ${LINK_FILE}.`);
    return legacy;
  }

  // Auto-migrate the older pre-M2 single-env `.envsync.json` into the
  // `.envhq/config.json` environments map.
  const legacySingleEnv = await readJson<LegacySingleEnvConfig>(
    join(cwd, LEGACY_SINGLE_ENV_FILE),
  );
  if (!legacySingleEnv) return null;

  const migrated: LinkConfig = {
    projectId: legacySingleEnv.projectId,
    projectName: legacySingleEnv.projectName,
    environments: {
      [legacySingleEnv.environmentName]: { id: legacySingleEnv.environmentId, file: ".env" },
    },
    default: legacySingleEnv.environmentName,
  };
  await writeLinkConfig(migrated, cwd);
  await rm(join(cwd, LEGACY_SINGLE_ENV_FILE), { force: true });
  console.error(`✔ Migrated ${LEGACY_SINGLE_ENV_FILE} → ${LINK_FILE}.`);
  return migrated;
}

export async function writeLinkConfig(config: LinkConfig, cwd = process.cwd()): Promise<void> {
  await mkdir(join(cwd, LINK_DIR), { recursive: true });
  await writeFile(join(cwd, LINK_FILE), JSON.stringify(config, null, 2) + "\n");
}

// Baked in at build time by tsup's `define` (see tsup.config.ts). For `tsx`
// dev runs the identifier is undeclared, so `typeof` safely yields "undefined"
// and we fall back to localhost.
declare const __ENVHQ_DEFAULT_URL__: string;
const BAKED_URL =
  typeof __ENVHQ_DEFAULT_URL__ !== "undefined"
    ? __ENVHQ_DEFAULT_URL__
    : "http://localhost:3000";

/**
 * Precedence: ENVHQ_URL env var → URL baked at build → localhost.
 * Note this only matters for the first `login`; after that the URL that was
 * used is persisted in the global config and reused by every command.
 */
export const DEFAULT_URL = process.env.ENVHQ_URL ?? BAKED_URL;
export const LINK_FILENAME = LINK_FILE;
export const LINK_DIRNAME = LINK_DIR;

/** Canonical, versioned API path prefix (ADR-010, HQ-54). The server also
 * keeps answering unversioned paths as an alias, but the CLI always targets
 * the canonical form. */
export const API_PREFIX = "/api/v1";

// Baked from package.json at build time (see tsup.config.ts) so `--version`
// can never drift from what's actually published. `tsx` dev runs fall back to
// a marker since nothing is baked.
declare const __ENVHQ_VERSION__: string;
export const CLI_VERSION =
  typeof __ENVHQ_VERSION__ !== "undefined" ? __ENVHQ_VERSION__ : "0.0.0-dev";
