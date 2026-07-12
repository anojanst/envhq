import type { EnvPair } from "@envhq/parser";
import { readGlobalConfig, writeGlobalConfig } from "./config.ts";
import { resolveToken, storeSession, envToken } from "./token-store.ts";
import { runLoginFlow } from "./auth/login.ts";

/**
 * Authenticated client for the EnvHQ REST API. Reuses the same endpoints the
 * web app uses, authenticating with a Bearer token resolved from the OS keychain
 * (or `ENVHQ_TOKEN`). On a `token_expired` 401 it transparently re-runs the
 * browser login and retries once — unless the token came from `ENVHQ_TOKEN`.
 */
export class ApiError extends Error {
  /** HTTP status, when the error came from a non-ok response. */
  status?: number;
  /** Parsed JSON body, when the error came from a non-ok response — e.g. a
   * `409`'s `{ currentVersion, serverPairs }` conflict payload. */
  data?: unknown;
}

interface Options {
  method?: string;
  body?: unknown;
  /** Override token/url (used during `login` before anything is stored). */
  auth?: { url: string; token: string };
  /** Internal: set after a transparent re-login to avoid retry loops. */
  _retried?: boolean;
}

type AuthSource = "env" | "keychain" | "legacy" | "override";

interface ResolvedAuth {
  url: string;
  token: string;
  source: AuthSource;
}

/**
 * Resolve the url + token for a request. Prefers the keychain / `ENVHQ_TOKEN`;
 * if only a legacy plaintext token remains in config.json, migrate it into the
 * keychain (best effort) and strip it from disk.
 */
async function loadAuth(): Promise<ResolvedAuth | null> {
  const config = await readGlobalConfig();
  if (!config) return null;
  const url = config.url;

  const resolved = resolveToken(url);
  if (resolved) return { url, token: resolved.token, source: resolved.source };

  if (config.token) {
    try {
      storeSession(url, { token: config.token });
      await writeGlobalConfig({ url }); // rewrite without the token
      console.error("✔ Moved your saved token into the OS keychain.");
    } catch {
      // No keychain available — keep using the legacy token for this run.
    }
    return { url, token: config.token, source: "legacy" };
  }

  return null;
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const auth: ResolvedAuth | null = options.auth
    ? { url: options.auth.url, token: options.auth.token, source: "override" }
    : await loadAuth();
  if (!auth) {
    throw new ApiError("Not logged in. Run `envhq login` first.");
  }

  let res: Response;
  try {
    res = await fetch(`${auth.url}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(`Could not reach ${auth.url}. Is the server running?`);
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 401) {
    const expired = data.error === "token_expired";
    // Transparent re-login: only for interactive keychain/legacy sessions, and
    // only once per call. Env-var (CI) tokens must be rotated by the user.
    if (expired && !options._retried && (auth.source === "keychain" || auth.source === "legacy")) {
      console.error("Your session has expired — re-authenticating…");
      const session = await runLoginFlow(auth.url);
      storeSession(auth.url, {
        token: session.token,
        expiresAt: session.expiresAt,
        userId: session.userId,
      });
      return request<T>(path, { ...options, _retried: true });
    }
    if (expired) {
      throw new ApiError(
        auth.source === "env"
          ? "Your ENVHQ_TOKEN has expired. Generate a new token in the web app."
          : "Your session has expired. Run `envhq login` again.",
      );
    }
    throw new ApiError("Unauthorized — your token may be invalid or revoked.");
  }

  if (!res.ok) {
    const err = new ApiError((data.error as string) ?? `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export interface Project {
  id: string;
  name: string;
}
export interface Environment {
  id: string;
  name: string;
}

export const apiClient = {
  me: (auth?: Options["auth"]) => request<{ userId: string }>("/api/me", { auth }),

  listOrgs: () => request<{ orgs: { id: string; name: string; role: string }[] }>("/api/orgs"),

  listProjects: (orgId?: string) =>
    request<{ projects: Project[] }>(`/api/projects${orgId ? `?orgId=${encodeURIComponent(orgId)}` : ""}`),

  getProject: (id: string) =>
    request<{ project: Project; environments: Environment[] }>(`/api/projects/${id}`),

  createProject: (name: string, environments?: string[], orgId?: string) =>
    request<{ project: Project; environments: Environment[] }>("/api/projects", {
      method: "POST",
      body: { name, ...(environments ? { environments } : {}), ...(orgId ? { orgId } : {}) },
    }),

  createEnvironment: (projectId: string, name: string, from?: string) =>
    request<{ environment: Environment }>(`/api/projects/${projectId}/environments`, {
      method: "POST",
      body: { name, ...(from ? { from } : {}) },
    }),

  exportEnv: (envId: string) =>
    request<{ content: string; count: number; version: number }>(`/api/environments/${envId}/export`),

  commit: (
    envId: string,
    body: { baseVersion: number; upsert?: EnvPair[]; delete?: string[]; message?: string },
  ) =>
    request<{ version: number; created: number; updated: number; deleted: number }>(
      `/api/environments/${envId}/commit`,
      { method: "POST", body },
    ),

  listVersions: (envId: string) =>
    request<{
      versions: {
        version: number;
        message: string | null;
        createdBy: string;
        createdByName: string;
        createdAt: string;
      }[];
    }>(`/api/environments/${envId}/versions`),

  rollback: (envId: string, version: number, body: { baseVersion: number; message?: string }) =>
    request<{ version: number }>(`/api/environments/${envId}/versions/${version}/rollback`, {
      method: "POST",
      body,
    }),
};

// Re-exported so index.ts can surface auth state without reaching into the store.
export { envToken };
