import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface LoopbackResult {
  code: string;
  state: string;
}

export interface Loopback {
  /** The ephemeral 127.0.0.1 port the browser will redirect back to. */
  port: number;
  /** Resolve once the browser hits /callback with a matching state + code. */
  waitForCode(expectedState: string): Promise<LoopbackResult>;
  close(): void;
}

const TIMEOUT_MS = 5 * 60 * 1000;

/** Start a loopback HTTP listener on an ephemeral 127.0.0.1 port. */
export function startLoopback(): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    let onResult: ((r: LoopbackResult) => void) | null = null;
    let onError: ((e: Error) => void) | null = null;

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end("Not found");
        return;
      }
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? "";

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        page(
          error
            ? "Login cancelled. You can close this tab."
            : "Login complete — return to your terminal.",
        ),
      );

      if (error) onError?.(new Error("Login was cancelled in the browser."));
      else if (code) onResult?.({ code, state });
      else onError?.(new Error("No authorization code was returned."));
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        waitForCode(expectedState) {
          return new Promise<LoopbackResult>((res2, rej2) => {
            const timer = setTimeout(
              () => rej2(new Error("Timed out waiting for browser approval.")),
              TIMEOUT_MS,
            );
            onResult = (r) => {
              clearTimeout(timer);
              if (r.state !== expectedState) {
                rej2(new Error("State mismatch — aborting login."));
                return;
              }
              res2(r);
            };
            onError = (e) => {
              clearTimeout(timer);
              rej2(e);
            };
          });
        },
        close: () => server.close(),
      });
    });
  });
}

function page(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>env-sync</title></head><body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="text-align:center"><h2 style="margin:0 0 .5rem">env-sync</h2><p style="color:#555">${message}</p></div></body></html>`;
}
