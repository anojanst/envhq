import Link from "next/link";
import { Logo } from "@/components/brand";
import { cn } from "@/lib/utils";

/**
 * `bordered` off for surfaces that separate their regions by rhythm and
 * spacing rather than by rules (the landing page).
 */
export function PublicFooter({ bordered = true }: { bordered?: boolean }) {
  return (
    <footer
      className={cn(
        "flex flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row",
        bordered && "border-t",
      )}
    >
      <Logo className="opacity-80" />
      <div className="flex items-center gap-4">
        <Link href="/docs" className="hover:text-foreground">
          Documentation
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms &amp; Conditions
        </Link>
      </div>
    </footer>
  );
}
