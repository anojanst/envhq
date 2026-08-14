"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { EnvBadge, ProjectAvatar } from "@/components/project-visuals";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * A working slice of the real variable editor, built from the same primitives
 * the app uses (project avatar, environment badge, table, buttons) with sample
 * data. It is a live component rather than a picture of one: switching the
 * environment and revealing values both actually work.
 */

const PROJECT = "orders-api";

const ENVIRONMENTS = ["dev", "staging", "prod"] as const;
type Environment = (typeof ENVIRONMENTS)[number];

const VARIABLES: Record<Environment, { key: string; value: string }[]> = {
  dev: [
    { key: "DATABASE_URL", value: "postgresql://core@127.0.0.1:5432/orders" },
    { key: "REDIS_URL", value: "redis://127.0.0.1:6379" },
    { key: "SESSION_SECRET", value: "dev-only-9f2b41ca" },
  ],
  staging: [
    { key: "DATABASE_URL", value: "postgresql://core@10.4.19.22:5432/orders" },
    { key: "REDIS_URL", value: "rediss://cache-2.internal:6380" },
    { key: "SESSION_SECRET", value: "t4Kq7Zr1Ms80Vb3Xd" },
  ],
  prod: [
    { key: "DATABASE_URL", value: "postgresql://core@10.7.3.41:5432/orders" },
    { key: "REDIS_URL", value: "rediss://cache-prod-1.internal:6380" },
    { key: "SESSION_SECRET", value: "Wq82Nd4Rk15Ptz6Y" },
  ],
};

const MASKS = ["••••••••••••••••", "••••••••••", "••••••••••••", "•••••••••••••"];

export function EnvPreview({ className }: { className?: string }) {
  const [environment, setEnvironment] = React.useState<Environment>("prod");
  const [revealed, setRevealed] = React.useState(false);

  const rows = VARIABLES[environment];

  return (
    <div className={cn("relative", className)}>
      {/* Ambient brand light behind the panel, tinted to the accent rather than
          a neutral drop shadow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-8 -z-10 rounded-full bg-brand/10 blur-3xl"
      />

      <div className="overflow-hidden rounded-xl bg-card shadow-lg shadow-brand/5 ring-1 ring-foreground/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <ProjectAvatar name={PROJECT} className="size-8" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{PROJECT}</div>
            <div className="text-xs text-muted-foreground">
              {rows.length} variables
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={revealed}
            aria-label={revealed ? "Hide values" : "Reveal values"}
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </div>

        <div
          role="group"
          aria-label="Environment"
          className="flex items-center gap-1 border-b px-3 pb-2"
        >
          {ENVIRONMENTS.map((name) => {
            const active = name === environment;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setEnvironment(name)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium outline-none",
                  "transition-colors duration-150 ease-fluid",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {name}
              </button>
            );
          })}

          <span className="ms-auto">
            <EnvBadge name={environment} />
          </span>
        </div>

        <Table>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.key}>
                <TableCell className="w-[45%] px-4 py-2.5 align-middle font-mono text-xs font-medium">
                  {row.key}
                </TableCell>
                <TableCell className="px-4 py-2.5 align-middle font-mono text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "block truncate transition-[filter,opacity] duration-200 ease-fluid",
                      !revealed && "opacity-70",
                    )}
                  >
                    {revealed ? row.value : MASKS[index % MASKS.length]}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
