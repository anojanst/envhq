import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthRouterContext } from "../router";

export const Route = createRootRouteWithContext<{ auth: AuthRouterContext }>()({
  component: () => <Outlet />,
});
