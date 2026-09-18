import type { Command } from "commander";
import { writeGlobalConfig, DEFAULT_URL } from "../config.ts";
import { apiClient, ApiError } from "../api.ts";
import { runLoginFlow } from "../auth/login.ts";
import { storeSession, keychainAvailable } from "../token-store.ts";
import { fail, daysUntil } from "../shared/ui.ts";

export function register(program: Command): void {
  program
    .command("login")
    .description("Authenticate via your browser (or --token for CI).")
    .option("-t, --token <token>", "personal access token (headless / CI)")
    .option("-u, --url <url>", "API base url", DEFAULT_URL)
    .action(async (opts: { token?: string; url: string }) => {
      const url = opts.url.replace(/\/$/, "");
      try {
        // CI / headless: validate the provided PAT, then store it.
        if (opts.token) {
          const { userId } = await apiClient.me({ url, token: opts.token });
          storeSession(url, { token: opts.token });
          await writeGlobalConfig({ url });
          console.log(`✔ Logged in to ${url} (user ${userId}).`);
          return;
        }

        // Interactive: the token lands in the OS keychain, so require one up front.
        if (!keychainAvailable()) {
          fail(
            "No OS keychain is available to store your login securely.\n" +
              "Set ENVHQ_TOKEN=<token> in your environment instead (recommended for CI).",
          );
        }

        const session = await runLoginFlow(url);
        storeSession(url, {
          token: session.token,
          expiresAt: session.expiresAt,
          userId: session.userId,
        });
        await writeGlobalConfig({ url });
        console.log(
          `✔ Logged in to ${url} (user ${session.userId}). Session valid for ${daysUntil(
            session.expiresAt,
          )} days.`,
        );
      } catch (err) {
        fail(err instanceof ApiError ? err.message : String(err));
      }
    });
}
