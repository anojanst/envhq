"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type State = "idle" | "copied" | "failed";

/**
 * A shell command the reader can take with them. The whole row is the press
 * target, and the icon swaps through a short blur so the two glyphs read as one
 * changing thing rather than two overlapping ones.
 */
export function CopyCommand({
  command,
  description,
  className,
}: {
  command: string;
  description: string;
  className?: string;
}) {
  const [state, setState] = React.useState<State>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function scheduleReset() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setState("copied");
    } catch {
      setState("failed");
    }
    scheduleReset();
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "group/copy flex w-full items-start justify-between gap-4 rounded-lg px-4 py-3.5 text-left",
        "outline-none transition-[background-color,transform] duration-150 ease-fluid",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        "active:scale-[0.99]",
        "hover:bg-muted/60 motion-reduce:active:scale-100",
        className,
      )}
    >
      <span className="min-w-0">
        {/* Emerald matches the terminal block, so a command reads the same
            wherever it appears on the page. The prompt is dimmed to the same
            hue rather than greyed, so it stays chrome without breaking the
            single-accent rule. */}
        <span className="block truncate font-mono text-[0.9375rem] text-brand">
          <span className="text-brand/50 select-none">$ </span>
          {command}
        </span>
        <span className="mt-1 block text-[0.8125rem] text-muted-foreground">
          {state === "failed" ? "Copy failed. Select the command to copy it." : description}
        </span>
      </span>

      <span
        aria-hidden
        className="relative mt-0.5 grid size-4 shrink-0 place-items-center text-muted-foreground"
      >
        <Copy
          className={cn(
            "col-start-1 row-start-1 size-4 transition-[opacity,filter] duration-200 ease-fluid",
            state === "copied" && "opacity-0 blur-[2px]",
          )}
        />
        <Check
          className={cn(
            "col-start-1 row-start-1 size-4 text-brand transition-[opacity,filter] duration-200 ease-fluid",
            state === "copied" ? "opacity-100" : "opacity-0 blur-[2px]",
          )}
        />
      </span>

      <span className="sr-only" role="status">
        {state === "copied" ? `Copied ${command}` : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
