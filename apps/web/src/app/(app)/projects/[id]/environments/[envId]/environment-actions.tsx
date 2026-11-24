"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { isProdEnv } from "@/components/project-visuals";
import { api } from "@/lib/client";

/**
 * Actions on the environment itself, next to the environment switcher — not
 * in the variables toolbar, where "Delete environment" sat beside everyday
 * value actions. Deliberately outside the editor's tree too: the editor's
 * render test counts its mount commits to catch eager decryption, and a menu
 * adds one of its own.
 */
export function EnvironmentActions({
  projectId,
  environmentId,
  envName,
  variableCount,
}: {
  projectId: string;
  environmentId: string;
  envName: string;
  variableCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const prod = isProdEnv(envName);

  async function remove() {
    await api(`/api/environments/${environmentId}`, { method: "DELETE" });
    toast.success(`Deleted ${envName}`);
    router.push(`/projects/${projectId}`);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for the ${envName} environment`} />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 /> Delete {envName}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDeleteDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete environment "${envName}"`}
        description={
          <>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">
              {variableCount} variable{variableCount === 1 ? "" : "s"}
            </span>{" "}
            and its history. This can&rsquo;t be undone.
          </>
        }
        confirmationText={prod ? envName : undefined}
        onConfirm={remove}
      />
    </>
  );
}
