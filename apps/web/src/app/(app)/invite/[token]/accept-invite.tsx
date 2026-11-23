"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      const { orgId } = await api<{ orgId: string }>("/api/invites/accept", { method: "POST", body: { token } });
      toast.success("You joined the team");
      router.replace(`/teams?org=${encodeURIComponent(orgId)}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Button className="w-full" onClick={accept} disabled={busy}>
      {busy ? "Joining…" : "Accept and join"}
    </Button>
  );
}
