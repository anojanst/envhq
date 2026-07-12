import { cn } from "@/lib/utils";

/**
 * EnvHQ brand mark — a rounded tile with an up/down sync glyph (push/pull),
 * filled with the brand color. Uses currentColor-free brand tokens so it stays
 * on-brand in both themes.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-brand text-brand-foreground",
        "size-7 shrink-0",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        {/* down arrow (pull) */}
        <path d="M7 4v13" />
        <path d="M11 13l-4 4-4-4" />
        {/* up arrow (push) */}
        <path d="M17 20V7" />
        <path d="M13 11l4-4 4 4" />
      </svg>
    </span>
  );
}

export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark className={markClassName} />
      <span className="font-semibold tracking-tight">
        env<span className="text-brand">HQ</span>
      </span>
    </span>
  );
}
