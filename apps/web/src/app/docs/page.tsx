import Link from "next/link";
import { DocsHeader } from "@/components/docs-ui";
import { FolderTree, TerminalSquare, ShieldCheck, LifeBuoy } from "lucide-react";

export const metadata = { title: "Overview" };

const CARDS = [
  {
    href: "/docs/getting-started",
    icon: FolderTree,
    title: "Getting started",
    body: "Create an account, make your first project, and push your first .env from the terminal.",
  },
  {
    href: "/docs/web-app",
    icon: FolderTree,
    title: "Using the web app",
    body: "Projects, environments, the variable editor, and CLI token management.",
  },
  {
    href: "/docs/cli",
    icon: TerminalSquare,
    title: "CLI reference",
    body: "Every envhq command, its options, and the config files it reads and writes.",
  },
  {
    href: "/docs/security",
    icon: ShieldCheck,
    title: "Security model",
    body: "How encryption, authentication, and access control work today.",
  },
  {
    href: "/docs/limitations",
    icon: LifeBuoy,
    title: "Limitations & FAQ",
    body: "What the free tool doesn't do yet, and answers to common questions.",
  },
];

export default function DocsOverviewPage() {
  return (
    <div>
      <DocsHeader
        title="EnvHQ documentation"
        lede="EnvHQ stores, organizes, and syncs environment variables. Values are grouped by project → environment → key, encrypted at rest, editable in the web app, and pushable/pullable from a terminal with the envhq CLI. The cloud is the source of truth."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ href, icon: Icon, title, body }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border bg-card p-4 transition-colors hover:border-brand/40 hover:bg-brand/5"
          >
            <div className="flex items-center gap-2">
              <Icon className="size-4 text-brand" />
              <span className="font-medium">{title}</span>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
