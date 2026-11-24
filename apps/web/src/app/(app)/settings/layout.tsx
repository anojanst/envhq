"use client";

import { usePathname } from "next/navigation";
import { HeaderTabs, PageHeader } from "@/components/page-header";

const TABS = [
  { label: "Encryption", href: "/settings/security" },
  { label: "CLI tokens", href: "/settings/tokens" },
  { label: "Groups", href: "/settings/groups" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings">
        <HeaderTabs tabs={TABS.map((t) => ({ ...t, active: pathname.startsWith(t.href) }))} />
      </PageHeader>
      {children}
    </div>
  );
}
