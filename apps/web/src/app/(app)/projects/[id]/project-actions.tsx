"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { ShareDialog } from "./share-dialog";
import { api } from "@/lib/client";

export function ProjectActions({
  project,
  environmentCount,
  variableCount,
  hasProdEnv,
}: {
  project: { id: string; name: string };
  environmentCount: number;
  variableCount: number;
  hasProdEnv: boolean;
}) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: { name: name.trim() },
      });
      toast.success("Project renamed");
      setRenameOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await api(`/api/projects/${project.id}`, { method: "DELETE" });
    toast.success("Project deleted");
    router.push("/dashboard");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShareOpen(true)}>
            <Users className="size-4" /> Manage access
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" /> Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <form onSubmit={rename}>
            <DialogHeader>
              <DialogTitle>Rename project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="rename">Name</Label>
              <Input
                id="rename"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ShareDialog projectId={project.id} open={shareOpen} onOpenChange={setShareOpen} />

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete project "${project.name}"`}
        description={
          <>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">
              {environmentCount} environment{environmentCount === 1 ? "" : "s"}
            </span>{" "}
            and{" "}
            <span className="font-medium text-foreground">
              {variableCount} variable{variableCount === 1 ? "" : "s"}
            </span>
            . This can&rsquo;t be undone.
          </>
        }
        confirmationText={hasProdEnv ? project.name : undefined}
        onConfirm={remove}
      />
    </>
  );
}
