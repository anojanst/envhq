"use client";

import { useRouter, usePathname } from "next/navigation";
import { nativeSelectClass } from "@/lib/utils";

/**
 * Page-local "which org am I looking at" control for pages whose data is
 * inherently org-scoped (groups, org members) with no other id to derive
 * org from. Navigates via a `?org=` query param and lets the server
 * component re-fetch — no Clerk session state involved, unlike the removed
 * sidebar `<OrganizationSwitcher>`. Renders nothing when there's only one
 * org to pick from (nothing to disambiguate).
 */
export function OrgPicker({
  orgs,
  value,
  paramName = "org",
}: {
  orgs: { id: string; name: string }[];
  value: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (orgs.length <= 1) return null;

  return (
    <select
      className={nativeSelectClass}
      value={value}
      onChange={(e) => router.push(`${pathname}?${paramName}=${encodeURIComponent(e.target.value)}`)}
      aria-label="Organization"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
