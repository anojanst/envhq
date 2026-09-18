import { access, readFile, appendFile } from "node:fs/promises";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Add `.envhq/` to .gitignore if it isn't already covered (idempotent). */
export async function ensureGitignored(cwd = process.cwd()): Promise<void> {
  const path = `${cwd}/.gitignore`;
  const existing = (await fileExists(path)) ? await readFile(path, "utf8") : "";
  if (existing.split("\n").some((line) => line.trim() === ".envhq/")) return;
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await appendFile(path, `${prefix}.envhq/\n`);
}
