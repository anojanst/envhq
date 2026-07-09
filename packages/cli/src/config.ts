import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";

/**
 * Two config files:
 *   - Global auth (~/.envsync/config.json): the API url + personal token.
 *   - Project link (./.envsync.json): which project/environment this folder maps
 *     to, so `pull`/`push` need no arguments.
 */

const GLOBAL_DIR = join(homedir(), ".envsync");
const GLOBAL_FILE = join(GLOBAL_DIR, "config.json");
const LINK_FILE = ".envsync.json";

export interface GlobalConfig {
  url: string;
  token: string;
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
  await writeFile(GLOBAL_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
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

export const DEFAULT_URL = process.env.ENVSYNC_URL ?? "http://localhost:3000";
export const LINK_FILENAME = LINK_FILE;
