import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

/**
 * Injects the strict Content-Security-Policy <meta> tag into index.html for
 * production builds only (`apply: "build"`) — never for `vite dev`, whose
 * HMR client relies on patterns a strict CSP would break, and whose script
 * injection differs from the built output anyway. The env check lives
 * inside `transformIndexHtml`, not the plugin factory — the factory always
 * runs (even for `vite dev`) just to register the plugin, so throwing there
 * would break dev regardless of `apply`.
 *
 * `frame-ancestors` is a documented no-op via <meta> per spec; real
 * enforcement needs an HTTP header set by whatever serves the built assets
 * (CDN config or the Go binary's embed middleware) — that's follow-up infra
 * work, not this package's job.
 */
function cspMetaPlugin(env: Record<string, string>): Plugin {
  return {
    name: "envhq-csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      const clerkFrontendApi = env.VITE_CLERK_FRONTEND_API_DOMAIN;
      if (!clerkFrontendApi) {
        throw new Error(
          "VITE_CLERK_FRONTEND_API_DOMAIN must be set to build (e.g. your-app.clerk.accounts.dev " +
            "in dev, clerk.envhq.dev in prod) — see .env.example.",
        );
      }

      const csp = [
        `default-src 'self'`,
        `script-src 'self'`,
        // Clerk's own CSP guide marks 'unsafe-inline' as required here —
        // their hosted components inject <style> tags at runtime for
        // theming, not just CSSOM property writes. This is the one
        // narrow carve-out: it doesn't touch script-src, so it doesn't
        // reopen the XSS-reads-the-DEK threat model ADR-006 cares about.
        `style-src 'self' 'unsafe-inline'`,
        `connect-src 'self' https://${clerkFrontendApi} https://*.protect.clerk.com`,
        `img-src 'self' data: https://img.clerk.com`,
        `font-src 'self'`,
        // Clerk's fraud-protection challenge runs in a worker + iframe.
        // Without these, the browser silently drops the request and Clerk
        // retries/times out before falling back — the likely cause of the
        // ~30s delay before redirecting to a protected route.
        `worker-src 'self' blob:`,
        `frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com`,
        `object-src 'none'`,
        `base-uri 'self'`,
        `frame-ancestors 'none'`,
      ].join("; ");

      // A <meta> CSP only protects markup that comes AFTER it in document
      // order — it must be the first thing in <head>, before Vite's own
      // injected <script>/<link> tags, or it's too late to cover them.
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  // vite.config.ts doesn't see .env/.env.local through process.env the way
  // application code does via import.meta.env — loadEnv reads them in
  // explicitly so `VITE_CLERK_FRONTEND_API_DOMAIN` works locally, not just
  // when a real shell/CI env var happens to be exported.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      tailwindcss(),
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      cspMetaPlugin(env),
    ],
    build: {
      // Vite's default modulepreload-polyfill injects an inline <script>
      // into index.html, which would need `unsafe-inline`. Disable it.
      modulePreload: { polyfill: false },
    },
  };
});
