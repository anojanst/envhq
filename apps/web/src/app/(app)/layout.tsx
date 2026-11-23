import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { getDirectoryUser, requireSessionUserId } from "@/lib/identity";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Persisted sidebar state (shadcn cookie) — read server-side so the sidebar
  // renders in the right state on first paint (no expand/collapse flash).
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  // The account menu's name and avatar: what the identity provider said at
  // this person's last sign-in. One indexed read, no provider call.
  const me = await getDirectoryUser(await requireSessionUserId());

  return (
    <AppShell defaultOpen={defaultOpen} user={{ name: me.name, email: me.email, imageUrl: me.imageUrl }}>
      {children}
    </AppShell>
  );
}
