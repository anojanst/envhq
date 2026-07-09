import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KeyRound, FolderTree, TerminalSquare } from "lucide-react";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <span className="font-semibold tracking-tight">env-sync</span>
        <div className="flex gap-2">
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
          <Button render={<Link href="/sign-up" />}>Get started</Button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Store, organize, and sync your environment variables.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Group secrets by project and environment — dev, qa, staging, uat, prod, and
          anything else. Encrypted at rest, pasteable in bulk, and syncable from your
          terminal.
        </p>
        <div className="flex gap-3">
          <Button size="lg" render={<Link href="/sign-up" />}>
            Create your first project
          </Button>
        </div>

        <div className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-3">
          <Feature icon={<FolderTree className="size-5" />} title="Projects & envs">
            Unlimited environments under every project.
          </Feature>
          <Feature icon={<KeyRound className="size-5" />} title="Encrypted at rest">
            Values are AES-256-GCM encrypted in the database.
          </Feature>
          <Feature icon={<TerminalSquare className="size-5" />} title="CLI-ready">
            Token-based API so you can push/pull from a terminal.
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
    <div className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
      <div className="text-primary">{icon}</div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
