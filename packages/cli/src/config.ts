import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";

/**
 * Two config files:
 *   - Global config (~/.envsync/config.json): the API url only. The secret token
 *     lives in the OS keychain (see token-store.ts), never on disk.
 *   - Project link (./.envsync.json): which project/environment this folder maps
 *     to, so `pull`/`push` need no arguments.
 */

const GLOBAL_DIR = join(homedir(), ".envsync");
const GLOBAL_FILE = join(GLOBAL_DIR, "config.json");
const LINK_FILE = ".envsync.json";

export interface GlobalConfig {
  url: string;
  /**
   * @deprecated Legacy plaintext token from pre-keychain versions. Still read so
   * we can migrate it into the OS keychain on first use, then strip it.
   */
  token?: string;
}

export interface LinkConfig {
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

export function readLinkConfig(cwd = process.cwd()): Promise<LinkConfig | null> {
  return readJson<LinkConfig>(join(cwd, LINK_FILE));
}

export async function writeLinkConfig(config: LinkConfig, cwd = process.cwd()): Promise<void> {
  await writeFile(join(cwd, LINK_FILE), JSON.stringify(config, null, 2) + "\n");
}

// Baked in at build time by tsup's `define` (see tsup.config.ts). For `tsx`
// dev runs the identifier is undeclared, so `typeof` safely yields "undefined"
// and we fall back to localhost.
declare const __ENVSYNC_DEFAULT_URL__: string;
const BAKED_URL =
  typeof __ENVSYNC_DEFAULT_URL__ !== "undefined"
    ? __ENVSYNC_DEFAULT_URL__
    : "http://localhost:3000";

/**
 * Precedence: ENVSYNC_URL env var → URL baked at build → localhost.
 * Note this only matters for the first `login`; after that the URL that was
 * used is persisted in the global config and reused by every command.
 */
export const DEFAULT_URL = process.env.ENVSYNC_URL ?? BAKED_URL;
export const LINK_FILENAME = LINK_FILE;

// Baked from package.json at build time (see tsup.config.ts) so `--version`
// can never drift from what's actually published. `tsx` dev runs fall back to
// a marker since nothing is baked.
declare const __ENVSYNC_VERSION__: string;
export const CLI_VERSION =
  typeof __ENVSYNC_VERSION__ !== "undefined" ? __ENVSYNC_VERSION__ : "0.0.0-dev";
