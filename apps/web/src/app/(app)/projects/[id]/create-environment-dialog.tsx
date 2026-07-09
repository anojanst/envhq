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
} from "@/components/ui/dialog";
import { api } from "@/lib/client";

const SUGGESTIONS = ["dev", "qa", "staging", "uat", "prod"];

export function CreateEnvironmentDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(envName: string) {
    if (!envName.trim()) return;
    setSaving(true);
    try {
      await api(`/api/projects/${projectId}/environments`, {
        method: "POST",
        body: { name: envName.trim() },
      });
      toast.success(`Environment "${envName}" created`);
      setName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" /> New environment
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create(name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Create environment</DialogTitle>
            <DialogDescription>
              Name it anything — common ones are below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setName(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <Label htmlFor="env-name">Environment name</Label>
            <Input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="prod"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
