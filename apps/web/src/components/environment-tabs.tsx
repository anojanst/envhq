import Link from "next/link";
import { Layers } from "lucide-react";
import { isProdEnv } from "@/components/project-visuals";
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
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
        <Layers className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No environments yet. Add one like <code>dev</code> or <code>prod</code>.
        </p>
      </div>
    );
  }

  return (
    <nav aria-label="Environments" className="flex max-w-full flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
      {environments.map((env) => {
        const prod = isProdEnv(env.name);
        const active = env.id === activeEnvId;

        return (
          <Link
            key={env.id}
            href={`/projects/${projectId}/environments/${env.id}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-1 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
              active && prod && "ring-amber-500/50",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                prod ? "bg-amber-500" : active ? "bg-brand" : "bg-muted-foreground/40",
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
