"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, Copy, KeyRound, Terminal, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * The dark panel beside the editor: what a developer reaches for after the
 * values themselves — the change history, the commands to use this
 * environment locally, and (for admins) who else can get at it.
 *
 * `dark` re-scopes the theme tokens for this subtree, so it's the same dark
 * panel in either app theme. Below xl it stacks under the editor.
 */
export function EnvironmentPanel({
  history,
  commands,
  admin,
}: {
  history: React.ReactNode;
  commands: string[];
  admin?: { accessHref: string; deployKeysHref: string; deployKeyCount: number };
}) {
  return (
    <aside
      aria-label="About this environment"
      className="dark flex flex-col gap-6 rounded-3xl bg-side-panel p-5 text-foreground shadow-soft xl:sticky xl:top-6"
    >
      {history}

      <section className="flex flex-col gap-3" aria-labelledby="use-heading">
        <h2 id="use-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Terminal className="size-4 text-muted-foreground" aria-hidden />
          Use it locally
        </h2>
        <CommandBlock commands={commands} />
      </section>

      {admin && (
        <nav aria-label="Project access" className="flex flex-col gap-1 border-t pt-4">
          <PanelLink href={admin.accessHref} icon={Users} label="Who has access" />
          <PanelLink
            href={admin.deployKeysHref}
            icon={KeyRound}
            label="Deploy keys"
            meta={admin.deployKeyCount > 0 ? `${admin.deployKeyCount} active` : "None yet"}
          />
        </nav>
      )}
    </aside>
  );
}

function CommandBlock({ commands }: { commands: string[] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(commands.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the text instead.");
    }
  }
  return (
    <div className="relative rounded-xl bg-background/60 ring-1 ring-border">
      <pre className="overflow-x-auto py-3 pr-10 pl-3.5 font-mono text-xs leading-relaxed">
        {commands.map((c) => (
          <div key={c}>
            <span className="text-muted-foreground select-none">$ </span>
            {c}
          </div>
        ))}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy commands"}
        className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

function PanelLink({
  href,
  icon: Icon,
  label,
  meta,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors",
        "hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
