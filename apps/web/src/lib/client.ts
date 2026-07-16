"use client";

/** Thrown by `api()` on a non-ok response — `data` carries the parsed JSON body, for callers that need more than the error message (e.g. `anyKeyExists`). */
export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Thin fetch wrapper for the browser. Same-origin, so the Clerk session cookie
 * is sent automatically and the API's getUserId() resolves the web user.
 * Throws with the API's error message so callers can surface it in a toast.
 */
export async function api<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}
