import { AppShell } from "@/components/app-shell";
import { getDirectoryUser, requireSessionUserId } from "@/lib/identity";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The account menu's name and avatar: what the identity provider said at
  // this person's last sign-in. One indexed read, no provider call.
  const me = await getDirectoryUser(await requireSessionUserId());

  return (
    <AppShell user={{ name: me.name, email: me.email, imageUrl: me.imageUrl }}>
      {children}
    </AppShell>
  );
}
