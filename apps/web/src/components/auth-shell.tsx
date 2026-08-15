import Link from "next/link";
import { Logo } from "@/components/brand";

/**
 * Branded frame for the Clerk auth pages. Committed dark like the rest of the
 * logged-out journey, so signing in is not a jarring flip to light halfway
 * through. No theme toggle: it would change nothing the visitor can see here.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="public-dark flex flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center px-6 py-4">
        <Link href="/">
          <Logo />
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-16">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="max-w-sm text-sm text-muted-foreground text-pretty">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}
