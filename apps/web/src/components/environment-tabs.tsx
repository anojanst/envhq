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
    <div className="flex flex-wrap gap-2">
      {environments.map((env) => {
        const prod = isProdEnv(env.name);
        const active = env.id === activeEnvId;

        return (
          <Link
            key={env.id}
            href={`/projects/${projectId}/environments/${env.id}`}
            className={cn(
              "flex items-center gap-2 rounded-lg border py-1.5 px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              prod
                ? active
                  ? "border-amber-500 bg-amber-500/10 text-foreground"
                  : "border-amber-500/30 bg-amber-500/5 text-foreground hover:border-amber-500/50"
                : active
                  ? "border-brand bg-brand/10 text-foreground"
                  : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                prod ? "bg-amber-500" : "bg-muted-foreground/40",
              )}
              aria-hidden
            />
            <span className="font-medium">{env.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{env.varCount}</span>
          </Link>
        );
      })}
    </div>
  );
}
