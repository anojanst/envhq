import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useSignIn } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { markSignedIn } from "../router";

export const Route = createFileRoute("/sign-in")({
  // Already signed in (e.g. reloading this URL directly) — Clerk rejects a
  // second sign-in attempt with "session already exists" if the form is
  // submitted again, so bounce to /dashboard before that can happen.
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SignInPage,
});

/**
 * Custom form via Clerk's headless `useSignIn()` hook — Clerk's hosted
 * `<SignIn>` component can't be used here, see clerk-theme-provider.tsx.
 * Handles the password happy path only; a `needs_second_factor` or similar
 * status shows a message rather than a full MFA flow, which is out of
 * scope for this scaffold.
 */
function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn.create({ strategy: "password", identifier, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        markSignedIn();
        navigate({ to: "/dashboard" });
      } else {
        setError(`Additional verification required (${result.status}) — not supported in this stub yet.`);
      }
    } catch (err) {
      setError(isClerkAPIResponseError(err) ? err.errors[0]?.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={!isLoaded || submitting}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <Link to="/sign-up" className="text-center text-sm text-muted-foreground hover:text-foreground">
          Don't have an account? Sign up
        </Link>
      </form>
    </div>
  );
}
