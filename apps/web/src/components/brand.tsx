import { cn } from "@/lib/utils";

/**
 * EnvHQ brand mark — a padlock whose body carries a terminal prompt, which is
 * the two things the product claims in one shape: sealed, and driven from a
 * terminal. Drawn rather than served as an image because `app-shell` renders
 * the mark alone without the wordmark, it has to stay crisp from 28px in a
 * sidebar to 36px in a header, and it follows the brand tokens instead of
 * baking one emerald into a file.
 *
 * `public/logo.svg` is the standalone copy of this geometry for contexts with
 * no CSS tokens (favicon, OG, README). Keep the two in step.
 *
 * The glyph uses `var(--brand-foreground)` rather than the `--color-*` alias:
 * `@theme inline` resolves those on `:root` against the light values once, so
 * the `.public-dark` override would never reach it and the prompt would stay
 * near-white on emerald instead of inverting.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-9 shrink-0 text-brand", className)}
      aria-hidden
    >
      {/* shackle */}
      <path
        d="M7 10.5V8a5 5 0 0 1 10 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      {/* body */}
      <rect x="2" y="10" width="20" height="12" rx="3.5" fill="currentColor" />
      {/* prompt chevron */}
      <path
        d="M7 13.8 9.9 16.1 7 18.4"
        fill="none"
        stroke="var(--brand-foreground)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* cursor rule */}
      <path
        d="M11.8 18.4h4.6"
        fill="none"
        stroke="var(--brand-foreground)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The wordmark on its own, for the places that show the name without the mark
 * (the app's mobile header). Exported so the `env`/`HQ` split lives in exactly
 * one file — it was previously copied into `app-shell` twice, which is how the
 * sidebar ended up on an older treatment than the public pages.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      env<span className="text-brand">HQ</span>
    </span>
  );
}

export function Logo({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  /** For callers that need to resize or hide the name — e.g. a collapsed sidebar. */
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <BrandMark className={markClassName} />
      {/* Sat against the lock's body rather than the whole mark: the shackle
          adds height above the body, so centring on the full glyph leaves the
          wordmark riding high. The nudge is in `em` rather than px so it tracks
          the lockup's scale — the mark and the type are always sized together,
          and a fixed 6px would sit wrong on the sidebar's smaller mark. */}
      <Wordmark
        className={cn("translate-y-[0.33em] text-lg", wordmarkClassName)}
      />
    </span>
  );
}
