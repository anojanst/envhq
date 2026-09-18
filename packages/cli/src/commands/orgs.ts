import type { Command } from "commander";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";

export function register(program: Command): void {
  program
    .command("orgs")
    .description("List the orgs you belong to.")
    .action(async () => {
      try {
        const { orgs } = await apiClient.listOrgs();
        if (orgs.length === 0) return console.log("No orgs found.");
        for (const o of orgs) console.log(`${o.name}  (${o.id})  — ${o.role}`);
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
