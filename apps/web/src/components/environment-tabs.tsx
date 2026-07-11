"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { isProdEnv } from "@/components/project-visuals";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";

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
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState<EnvironmentTabItem | null>(null);

  async function handleDelete(env: EnvironmentTabItem) {
    await api(`/api/environments/${env.id}`, { method: "DELETE" });
    toast.success(`Deleted "${env.name}"`);
    if (env.id === activeEnvId) {
      // The page we're standing on just disappeared.
      router.push(`/projects/${projectId}`);
    } else {
      router.refresh();
    }
  }

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
    <>
      <div className="flex flex-wrap gap-2">
        {environments.map((env) => {
          const prod = isProdEnv(env.name);
          const active = env.id === activeEnvId;

          return (
            <Link
              key={env.id}
              href={`/projects/${projectId}/environments/${env.id}`}
              className={cn(
                "group relative flex items-center gap-2 rounded-lg border py-1.5 pr-8 pl-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              <span className="text-xs text-muted-foreground tabular-nums">
                {env.varCount}
              </span>

              <button
                type="button"
                aria-label={`Delete ${env.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPendingDelete(env);
                }}
                className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </Link>
          );
        })}
      </div>

      {pendingDelete ? (
        <ConfirmDeleteDialog
          open={!!pendingDelete}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
          title={`Delete environment "${pendingDelete.name}"`}
          description={
            <>
              This permanently deletes{" "}
              <span className="font-medium text-foreground">
                {pendingDelete.varCount} variable
                {pendingDelete.varCount === 1 ? "" : "s"}
              </span>
              . This can&rsquo;t be undone.
            </>
          }
          confirmationText={isProdEnv(pendingDelete.name) ? pendingDelete.name : undefined}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      ) : null}
    </>
  );
}
