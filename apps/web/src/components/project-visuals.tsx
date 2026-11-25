import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// A project's prod environment(s) get treated as higher blast-radius
// throughout the app (badge color, tab accent, delete-confirmation friction).
export function isProdEnv(name: string): boolean {
  return /prod/i.test(name);
}

// A project's pastel: its monogram tile, its card's "updated" tag and its
// activity curve all take the same one, picked from the name so it's stable.
// Soft fills, saturated ink — the stat-card look. Class strings are literal
// so Tailwind can detect them.
const TINTS = [
  { tile: "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300", chip: "bg-teal-100/70 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300", text: "text-teal-500 dark:text-teal-400" },
  { tile: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300", chip: "bg-orange-100/70 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300", text: "text-orange-400 dark:text-orange-400" },
  { tile: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300", chip: "bg-rose-100/70 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300", text: "text-rose-400 dark:text-rose-400" },
  { tile: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300", chip: "bg-sky-100/70 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300", text: "text-sky-500 dark:text-sky-400" },
  { tile: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300", chip: "bg-violet-100/70 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300", text: "text-violet-400 dark:text-violet-400" },
  { tile: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300", chip: "bg-amber-100/70 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300", text: "text-amber-400 dark:text-amber-400" },
];

export function projectTint(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return TINTS[hash % TINTS.length]!;
}

export function ProjectAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const style = projectTint(name).tile;

  const parts = name.trim().split(/[\s\-_./]+/).filter(Boolean);
  const initials = (
    parts.length >= 2 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2) || "?"
  ).toUpperCase();

  return (
    <Avatar className={cn("size-9 rounded-lg after:rounded-lg", className)} aria-hidden>
      <AvatarFallback className={cn("rounded-lg text-xs font-semibold", style)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Environments read by colour at a glance: prod rose (handle with care),
 * staging/preview peach, dev/local mint, anything else neutral.
 */
export function envTone(name: string): "prod" | "staging" | "dev" | "other" {
  if (isProdEnv(name)) return "prod";
  if (/stag|preview|qa|uat|test/i.test(name)) return "staging";
  if (/dev|local/i.test(name)) return "dev";
  return "other";
}

const ENV_BADGE = {
  prod: "bg-rose-100/80 text-rose-800 dark:bg-rose-400/15 dark:text-rose-300",
  staging: "bg-orange-100/80 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300",
  dev: "bg-teal-100/80 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300",
  other: "bg-muted text-muted-foreground",
} as const;

export function EnvBadge({ name }: { name: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", ENV_BADGE[envTone(name)])}>
      {name}
    </span>
  );
}
