import type { Command } from "commander";
import { readGlobalConfig } from "../config.ts";
import { unlockInteractive } from "../crypto-session.ts";
import { loadCachedKeypair } from "../crypto-store.ts";
import { fail } from "../shared/ui.ts";

export function register(program: Command): void {
  program
    .command("unlock")
    .description("Unlock your end-to-end encryption key for this machine (cached until `lock`/`logout`).")
    .action(async () => {
      try {
        const config = await readGlobalConfig();
        if (!config) fail("Not logged in. Run `envhq login` first.");
        if (loadCachedKeypair(config.url)) {
          console.log("✔ Already unlocked (cached in your OS keychain).");
          return;
        }
        await unlockInteractive(config.url);
        console.log("✔ Unlocked.");
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    });
}
