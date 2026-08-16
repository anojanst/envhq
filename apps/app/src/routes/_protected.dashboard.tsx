import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "../components/stub-page";

export const Route = createFileRoute("/_protected/dashboard")({
  component: () => <StubPage title="Dashboard" note="Stub — projects list ported in HQ-61." />,
});
