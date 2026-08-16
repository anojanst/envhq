import { createFileRoute } from "@tanstack/react-router";
import { StubPage } from "../components/stub-page";

export const Route = createFileRoute("/_protected/teams")({
  component: () => (
    <StubPage title="Teams" note="Stub — Clerk OrganizationProfile wiring ported in a later ticket." />
  ),
});
