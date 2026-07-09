"use client";

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
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return data as T;
}
