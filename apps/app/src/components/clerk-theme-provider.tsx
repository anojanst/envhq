import { ClerkProvider, type ClerkProp } from "@clerk/clerk-react";
import { Clerk } from "@clerk/clerk-js";

/**
 * `Clerk={Clerk}` is load-bearing for the CSP: by default `@clerk/clerk-react`
 * hot-loads clerk-js via an injected <script> pointed at Clerk's own Frontend
 * API host, which would violate `script-src 'self'`. Passing a constructed
 * `Clerk` instance (imported directly, not fetched) skips that CDN-script
 * branch and bundles clerk-js into this app's own same-origin output.
 *
 * Constraint this creates, discovered the hard way: Clerk's HOSTED UI
 * components (`<SignIn>`, `<SignUp>`, `<UserButton>`, `<OrganizationProfile>`,
 * etc.) come from a separate, undocumented internal package (`@clerk/ui`)
 * that this self-hosting path never wires up — they throw "Clerk was not
 * loaded with Ui components" if rendered. Every Clerk-related UI surface in
 * this app has to be built custom via headless hooks (`useSignIn`,
 * `useSignUp`, `useUser`, `useOrganization`, `useClerk().signOut()`, etc.)
 * instead of Clerk's drop-in components — see `routes/sign-in.tsx` /
 * `routes/sign-up.tsx`. This applies to every future ticket that touches
 * Clerk UI here (teams/org management, a user menu, etc.), not just auth.
 *
 * clerk-js's types don't structurally match `ClerkProp` (missing
 * `onComponentsReady`/`components`/`updateClient`, which
 * `@clerk/clerk-react`'s wrapper attaches itself at runtime) — hence the cast.
 */
export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      Clerk={Clerk as unknown as ClerkProp}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
    >
      {children}
    </ClerkProvider>
  );
}
