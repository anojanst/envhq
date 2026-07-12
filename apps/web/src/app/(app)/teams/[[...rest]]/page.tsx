import { OrganizationProfile } from "@clerk/nextjs";

export default function TeamsPage() {
  return (
    <div className="flex justify-center">
      <OrganizationProfile routing="path" path="/teams" />
    </div>
  );
}
