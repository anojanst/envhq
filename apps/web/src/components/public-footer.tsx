import Link from "next/link";
import { Logo } from "@/components/brand";

export function PublicFooter() {
  return (
    <footer className="flex flex-col items-center justify-between gap-3 border-t px-6 py-6 text-sm text-muted-foreground sm:flex-row">
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
