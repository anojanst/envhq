import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyRound, FolderTree, TerminalSquare, ShieldCheck } from "lucide-react";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <Logo />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
          <Button render={<Link href="/sign-up" />}>Get started</Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="size-3.5 text-brand" />
          Encrypted at rest · CLI-native
        </span>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
          Store, organize, and <span className="text-brand">sync</span> your
          environment variables.
        </h1>
        <p className="max-w-xl text-muted-foreground text-pretty sm:text-lg">
          Group secrets by project and environment — dev, qa, staging, uat, prod, and
          anything else. Paste a whole <code>.env</code>, copy it back, and push or pull
          from your terminal.
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" render={<Link href="/sign-up" />}>
            Create your first project
          </Button>
          <Button size="lg" variant="outline" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
        </div>

        <div className="mt-2 w-full max-w-md rounded-lg border bg-card p-4 text-left font-mono text-sm shadow-sm">
          <div className="text-muted-foreground">
            <span className="text-brand">$</span> envhq push prod
          </div>
          <div className="text-muted-foreground">
            <span className="text-brand">✔</span> Pushed to prod: 2 new, 1 updated
          </div>
        </div>

        <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-3">
          <Feature icon={<FolderTree className="size-5" />} title="Projects & envs">
            Unlimited environments under every project.
          </Feature>
          <Feature icon={<KeyRound className="size-5" />} title="Encrypted at rest">
            Values are AES-256-GCM encrypted in the database.
          </Feature>
          <Feature icon={<TerminalSquare className="size-5" />} title="CLI-native">
            Push and pull secrets straight from your terminal.
          </Feature>
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-5 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
        {icon}
      </div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
