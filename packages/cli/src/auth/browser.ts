import { spawn } from "node:child_process";

/**
 * Best-effort open of a URL in the user's default browser. Failures are
 * swallowed — the caller always prints the URL as a fallback.
 */
export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];

  try {
    const child = spawn(cmd as string, args as string[], {
      stdio: "ignore",
      detached: true,
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    // Ignore — the fallback URL is already on screen.
  }
}
