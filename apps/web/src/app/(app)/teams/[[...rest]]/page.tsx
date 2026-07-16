"use client";

import { useEffect, useMemo, useRef } from "react";
import { OrganizationProfile, useOrganization, useOrganizationList } from "@clerk/nextjs";
import { nativeSelectClass } from "@/lib/utils";

/**
 * Clerk's `<OrganizationProfile>` always renders whichever org is "active"
 * in the Clerk session — there's no prop to target a different org
 * directly. With the global sidebar switcher gone, this page owns its own
 * tiny picker that calls `setActive()` before/while rendering the profile,
 * so a multi-org user can still reach a non-default org's team management.
 */
export default function TeamsPage() {
  const { organization: activeOrg, isLoaded: orgLoaded } = useOrganization();
  const { isLoaded: listLoaded, userMemberships, setActive } = useOrganizationList({
    userMemberships: true,
  });
  // A ref, not state: this only gates a one-time side effect (calling Clerk's
  // own setActive), not anything rendered — a state flag here would just
  // trigger an extra render for no visual purpose.
  const attemptedDefault = useRef(false);

  const membershipsData = userMemberships?.data;
  const memberships = useMemo(() => membershipsData ?? [], [membershipsData]);

  // No active org yet (e.g. a session that predates the sidebar switcher's
  // removal, or a brand-new one) — land on the first membership rather than
  // showing OrganizationProfile with nothing to display.
  useEffect(() => {
    if (!orgLoaded || !listLoaded || activeOrg || attemptedDefault.current || memberships.length === 0) {
      return;
    }
    attemptedDefault.current = true;
    setActive?.({ organization: memberships[0].organization.id });
  }, [orgLoaded, listLoaded, activeOrg, memberships, setActive]);

  return (
    <div className="flex flex-col items-center gap-4">
      {listLoaded && memberships.length > 1 ? (
        <select
          className={nativeSelectClass}
          value={activeOrg?.id ?? ""}
          onChange={(e) => setActive?.({ organization: e.target.value })}
          aria-label="Organization"
        >
          {memberships.map((m) => (
            <option key={m.organization.id} value={m.organization.id}>
              {m.organization.name}
            </option>
          ))}
        </select>
      ) : null}
      <OrganizationProfile routing="path" path="/teams" />
    </div>
  );
}
