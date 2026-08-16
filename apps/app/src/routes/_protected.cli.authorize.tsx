import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cliAuthorizeSearchSchema = z.object({
  port: z.string().optional(),
  state: z.string().optional(),
  challenge: z.string().optional(),
});

export const Route = createFileRoute("/_protected/cli/authorize")({
  validateSearch: cliAuthorizeSearchSchema,
  component: CliAuthorizeStub,
});

function CliAuthorizeStub() {
  const { port, state, challenge } = Route.useSearch();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-lg font-semibold">CLI authorize</h1>
      <p className="text-sm text-muted-foreground">Stub — device-login approval ported in HQ-64.</p>
      <p className="font-mono text-xs text-muted-foreground">
        port={port ?? "–"} state={state ?? "–"} challenge={challenge ?? "–"}
      </p>
    </div>
  );
}
