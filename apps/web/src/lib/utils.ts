import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Shared styling for plain `<select>` elements (role/env pickers, org
 * filters). Native on purpose — platform keyboard handling, screen-reader
 * semantics and the mobile picker for free. Matches `Input`'s height, radius
 * and focus ring; the arrow comes from the base `select` rule in globals.css.
 */
export const nativeSelectClass =
  "h-8 min-w-0 rounded-lg border border-input bg-transparent pl-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

/** "3m ago" / "2h ago" / "5d ago", falling back to a locale date past ~30 days. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
