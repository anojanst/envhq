import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// A project's prod environment(s) get treated as higher blast-radius
// throughout the app (badge color, tab accent, delete-confirmation friction).
export function isProdEnv(name: string): boolean {
  return /prod/i.test(name);
}

// Deterministic monogram tile — gives each project a stable visual anchor to
// scan by. Shared between dashboard cards and the create-project preview so
// the same name always renders the same tile. Class strings are literal so
// Tailwind can detect them.
const TILE_STYLES = [
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
];

export function ProjectAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const style = TILE_STYLES[hash % TILE_STYLES.length];

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

export function EnvBadge({ name }: { name: string }) {
  const isProd = isProdEnv(name);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        isProd
          ? "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-400"
          : "bg-muted text-muted-foreground ring-border",
      )}
    >
      {name}
    </span>
  );
}
