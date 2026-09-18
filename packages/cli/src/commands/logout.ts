import type { Command } from "commander";
import { readGlobalConfig, clearGlobalConfig } from "../config.ts";
import { clearSession } from "../token-store.ts";
import { clearCachedKeypair } from "../crypto-store.ts";

export function register(program: Command): void {
  program
    .command("logout")
    .description("Remove stored credentials.")
    .action(async () => {
      const config = await readGlobalConfig();
      if (config) {
        clearSession(config.url);
        clearCachedKeypair(config.url);
      }
      await clearGlobalConfig();
      console.log("✔ Logged out.");
    });
}
