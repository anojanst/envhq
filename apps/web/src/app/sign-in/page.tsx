import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { safeReturnTo } from "@/lib/session";

export const metadata = { title: "Sign in" };

/**
 * One button: EnvHQ signs people in only through the configured OpenID
 * Connect provider, which decides who may have an account — so there is no
 * separate sign-up. A plain GET form, so it works before any JavaScript.
 */
const ERRORS: Record<string, string> = {
  expired: "That sign-in took too long or was started in another tab. Try again.",
  callback: "The sign-in provider didn't complete the sign-in. Try again.",
  provider: "EnvHQ can't reach its sign-in provider right now. Try again in a moment.",
  domain: "Your account's email domain isn't allowed to use this EnvHQ.",
  unverified: "Verify your email address with your sign-in provider, then try again.",
  no_subject: "The sign-in provider didn't say who you are. Ask your administrator to check the setup.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string; error?: string }>;
}) {
  const { redirect_url, error } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.callback) : null;

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your projects, environments, and secrets.">
      <form action="/auth/sign-in" method="get" className="flex w-full max-w-sm flex-col gap-3">
        <input type="hidden" name="redirect_url" value={safeReturnTo(redirect_url)} />
        {message ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full">
          Continue
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          New here? Continuing creates your account.
        </p>
      </form>
    </AuthShell>
  );
}
