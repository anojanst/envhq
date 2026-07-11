"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { ProjectAvatar, EnvBadge } from "@/components/project-visuals";
import { cn } from "@/lib/utils";
import { api } from "@/lib/client";

const NAME_PLACEHOLDER = "acme-api";
const MAX_LENGTH = 60;

export function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const previewName = trimmed || "your-project";

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Dialog is gone either way; don't carry a stale name/error into the
      // next open (matches the create-environment dialog's reset-on-close).
      setName("");
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/projects", { method: "POST", body: { name: trimmed } });
      toast.success(`Project "${trimmed}" created`);
      handleOpenChange(false);
      router.refresh();
    } catch (err) {
      // Stays inline (not just a toast) since the dialog remains open on
      // failure and the user shouldn't lose their place to find out why.
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" /> New project
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
            <DialogDescription>
              Projects group the environments that hold your variables. We&rsquo;ll
              add a <span className="font-medium text-foreground">dev</span>{" "}
              environment to start you off.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <ProjectAvatar name={previewName} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    !trimmed && "text-muted-foreground",
                  )}
                >
                  {previewName}
                </p>
                <div className="mt-1">
                  <EnvBadge name="dev" />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={NAME_PLACEHOLDER}
                maxLength={MAX_LENGTH}
                autoFocus
                aria-invalid={!!error}
              />
              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={saving || !trimmed}>
              {saving ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
