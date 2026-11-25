import Link from "next/link";
import { Layers } from "lucide-react";
import { envTone } from "@/components/project-visuals";
import { cn } from "@/lib/utils";

interface EnvironmentTabItem {
  id: string;
  name: string;
  varCount: number;
}

export function EnvironmentTabs({
  projectId,
  environments,
  activeEnvId,
}: {
  projectId: string;
  environments: EnvironmentTabItem[];
  /** Set on the editor page (this env is "current"); omitted on the project
   * page, where every tab is an equally-weighted destination. */
  activeEnvId?: string;
}) {
  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 py-16 text-center">
        <Layers className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No environments yet. Add one like <code>dev</code> or <code>prod</code>.
        </p>
      </div>
    );
  }

  return (
    <nav aria-label="Environments" className="flex max-w-full flex-wrap gap-1 rounded-2xl bg-muted p-1 sm:rounded-full">
      {environments.map((env) => {
        const tone = envTone(env.name);
        const active = env.id === activeEnvId;

        return (
          <Link
            key={env.id}
            href={`/projects/${projectId}/environments/${env.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-soft ring-1 ring-foreground/[0.06]"
                : "text-muted-foreground hover:text-foreground",
              active && tone === "prod" && "ring-rose-400/50",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                TONE_DOT[tone],
              )}
              aria-hidden
            />
            <span className="font-mono font-medium">{env.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${env.varCount} variables`}>
              {env.varCount}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

const TONE_DOT = {
  prod: "bg-rose-500",
  staging: "bg-orange-400",
  dev: "bg-teal-500",
  other: "bg-muted-foreground/50",
} as const;
