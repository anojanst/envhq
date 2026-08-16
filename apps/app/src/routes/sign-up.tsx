import { useState, type FormEvent } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useSignUp } from "@clerk/clerk-react";
import { isClerkAPIResponseError } from "@clerk/clerk-react/errors";
import { markSignedIn } from "../router";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: ({ context }) => {
    if (context.auth.isSignedIn) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: SignUpPage,
});

/**
 * Custom form via Clerk's headless `useSignUp()` hook — same reason as
 * sign-in.tsx. Handles the standard email+password+code-verification happy
 * path only; other verification strategies (e.g. a Clerk instance
 * configured for phone or `email_link` instead of `email_code`) aren't
 * covered by this stub.
 */
function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setSubmitting(true);
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      setError(isClerkAPIResponseError(err) ? err.errors[0]?.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (!isLoaded) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        markSignedIn();
        navigate({ to: "/dashboard" });
      } else {
        setError(`Additional step required (${result.status}) — not supported in this stub yet.`);
      }
    } catch (err) {
      setError(isClerkAPIResponseError(err) ? err.errors[0]?.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <form onSubmit={handleVerify} className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            Enter the verification code we sent to {emailAddress}.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Verification code
            <input
              type="text"
              required
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={!isLoaded || submitting}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleCreate} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-lg font-semibold">Sign up</h1>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={emailAddress}
            onChange={(event) => setEmailAddress(event.target.value)}
            className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="new-password"
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
          {submitting ? "Signing up…" : "Sign up"}
        </button>
        <Link to="/sign-in" className="text-center text-sm text-muted-foreground hover:text-foreground">
          Already have an account? Sign in
        </Link>
      </form>
    </div>
  );
}
