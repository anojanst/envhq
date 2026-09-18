import type { Command } from "commander";
import { apiClient, ApiError } from "../api.ts";
import { fail } from "../shared/ui.ts";

export function register(program: Command): void {
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
}
