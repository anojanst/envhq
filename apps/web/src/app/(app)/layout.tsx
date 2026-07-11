import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Persisted sidebar state (shadcn cookie) — read server-side so the sidebar
  // renders in the right state on first paint (no expand/collapse flash).
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return <AppShell defaultOpen={defaultOpen}>{children}</AppShell>;
}
