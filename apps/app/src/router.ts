import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface AuthRouterContext {
  isLoaded: boolean;
  isSignedIn: boolean;
}

export const router = createRouter({
  routeTree,
  context: {
    // Populated for real once Clerk resolves — see main.tsx. Routes should
    // only read this after `_protected`'s beforeLoad has run, which itself
    // waits on `context.auth.isLoaded`.
    auth: undefined as unknown as AuthRouterContext,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * `<RouterProvider context={...}>` only pushes a fresh `context.auth` into
 * the router on `main.tsx`'s *next* render — but right after `setActive()`
 * resolves in the sign-in/sign-up flow, we `navigate()` in the same tick,
 * before React has necessarily re-rendered with `isSignedIn: true`. Without
 * this, `_protected`'s `beforeLoad` sometimes still sees the stale
 * `isSignedIn: false` and bounces straight back to `/sign-in` — a real race,
 * not hypothetical (reproduced: first click appeared to do nothing, second
 * click hit Clerk's "session already exists"). Call this synchronously right
 * after `setActive()`, before `navigate()`, so `beforeLoad` sees fresh state
 * regardless of React's render timing.
 */
export function markSignedIn() {
  router.update({
    ...router.options,
    context: { ...router.options.context, auth: { isLoaded: true, isSignedIn: true } },
  });
}
