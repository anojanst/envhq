import type { Command } from "commander";
import { readGlobalConfig, readLinkConfig, DEFAULT_URL } from "../config.ts";
import { resolveToken } from "../token-store.ts";
import { daysUntil } from "../shared/ui.ts";

export function register(program: Command): void {
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
}
