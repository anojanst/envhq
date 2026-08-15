import { cn } from "@/lib/utils";

/**
 * EnvHQ brand mark — a rounded tile carrying a terminal prompt, filled with the
 * brand color. Drawn rather than served as an image: `app-shell` renders the
 * mark on its own without the wordmark, the glyph has to stay crisp from 20px
 * in a sidebar to 40px in a header, and the tile inherits the brand token so it
 * follows the palette instead of baking one emerald into a file.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-brand text-brand-foreground",
        "size-9 shrink-0",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        {/* prompt chevron */}
        <path d="M5.5 6.5 13 12l-7.5 5.5" />
        {/* cursor rule */}
        <path d="M13.5 17.5H19" />
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
      <span className="text-lg font-semibold tracking-tight">
        env<span className="text-brand">HQ</span>
      </span>
    </span>
  );
}
