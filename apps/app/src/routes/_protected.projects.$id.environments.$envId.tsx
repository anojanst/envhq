import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/projects/$id/environments/$envId")({
  component: EnvironmentStub,
});

function EnvironmentStub() {
  const { envId } = Route.useParams();
  return (
    <p className="text-sm text-muted-foreground">
      Environment {envId} — stub, environment editor and crypto session ported in HQ-62.
    </p>
  );
}
