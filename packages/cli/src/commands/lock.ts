import type { Command } from "commander";
import { readGlobalConfig } from "../config.ts";
import { clearCachedKeypair } from "../crypto-store.ts";

export function register(program: Command): void {
  program
    .command("lock")
    .description("Forget the cached encryption key on this machine.")
    .action(async () => {
      const config = await readGlobalConfig();
      if (config) clearCachedKeypair(config.url);
      console.log("✔ Locked.");
    });
}
