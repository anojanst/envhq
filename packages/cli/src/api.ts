import { readGlobalConfig } from "./config.ts";

/**
 * Authenticated client for the env-sync REST API. Reuses the same endpoints the
 * web app uses, authenticating with the stored personal token (Bearer).
 */
export class ApiError extends Error {}

interface Options {
  method?: string;
  body?: unknown;
  /** Override token/url (used during `login` before config is saved). */
  auth?: { url: string; token: string };
}

async function request<T>(path: string, options: Options = {}): Promise<T> {
  const auth = options.auth ?? (await readGlobalConfig());
  if (!auth) {
    throw new ApiError("Not logged in. Run `envsync login --token <token>` first.");
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
  if (!res.ok) {
    if (res.status === 401) throw new ApiError("Unauthorized — your token may be invalid or revoked.");
    throw new ApiError((data.error as string) ?? `Request failed (${res.status})`);
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

  listProjects: () => request<{ projects: Project[] }>("/api/projects"),

  getProject: (id: string) =>
    request<{ project: Project; environments: Environment[] }>(`/api/projects/${id}`),

  exportEnv: (envId: string) =>
    request<{ content: string; count: number }>(`/api/environments/${envId}/export`),

  importEnv: (envId: string, content: string) =>
    request<{ created: number; updated: number; total: number }>(
      `/api/environments/${envId}/import`,
      { method: "POST", body: { content } },
    ),
};
