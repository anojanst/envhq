import Link from "next/link";
import { requireSessionUserId } from "@/lib/identity";
import { previewInvite } from "@/lib/org-admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AcceptInvite } from "./accept-invite";

/**
 * Where an invite link lands. Signing in is required first (the middleware
 * sends anyone without a session to sign in and back here), so the person
 * accepting is whoever the identity provider says they are — the link only
 * decides which team and which role.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await requireSessionUserId();
  const { token } = await params;
  const invite = await previewInvite(token);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pt-8 sm:pt-16">
      <Card>
        {invite ? (
          <>
            <CardHeader>
              <CardTitle>Join {invite.orgName}</CardTitle>
              <CardDescription>
                You&rsquo;ve been invited as {invite.role === "admin" ? "an admin" : "a member"}. You&rsquo;ll see the
                team&rsquo;s projects you&rsquo;re given access to{invite.role === "admin" ? " — as an admin, all of them" : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcceptInvite token={token} />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>This invite link doesn&rsquo;t work</CardTitle>
              <CardDescription>
                It may have expired, been used already, or been revoked. Ask a team admin for a new one.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
                Go to dashboard
              </Link>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
