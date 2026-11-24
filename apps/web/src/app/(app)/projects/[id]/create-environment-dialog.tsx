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
import { isProdEnv } from "@/components/project-visuals";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["dev", "staging", "qa", "uat", "prod"];

export function CreateEnvironmentDialog({
  projectId,
  existingNames = [],
  prominent = false,
}: {
  projectId: string;
  /** Hidden from the suggestions — offering a name that already exists is a guaranteed error. */
  existingNames?: string[];
  /** The primary call to action (an empty project), rather than a quiet add button. */
  prominent?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  const suggestions = SUGGESTIONS.filter((s) => !taken.has(s));
  const trimmed = name.trim();
  const duplicate = taken.has(trimmed.toLowerCase());

  async function create(envName: string) {
    if (!envName || duplicate) return;
    setSaving(true);
    try {
      const res = await api<{ environment?: { id: string } }>(`/api/projects/${projectId}/environments`, {
        method: "POST",
        body: { name: envName },
      });
      toast.success(`Created ${envName}`);
      setName("");
      setOpen(false);
      // Straight into the new environment: an empty one is somewhere you've
      // just decided to put values.
      if (res.environment?.id) router.push(`/projects/${projectId}/environments/${res.environment.id}`);
      else router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={prominent ? "default" : "ghost"} size={prominent ? "default" : "sm"} />}>
        <Plus /> {prominent ? "Add an environment" : "Environment"}
      </DialogTrigger>
      <DialogContent>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            void create(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>New environment</DialogTitle>
            <DialogDescription>
              Each environment holds its own values and history. Anything named like{" "}
              <code>prod</code> asks for confirmation before risky changes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="env-name">Name</Label>
            <Input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="staging"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              aria-invalid={duplicate || undefined}
              autoFocus
            />
            {duplicate ? (
              <p className="text-xs text-destructive">This project already has an environment called {trimmed}.</p>
            ) : (
              suggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Suggestions</span>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setName(s)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors hover:bg-accent",
                        isProdEnv(s) && "border-amber-500/40 text-amber-700 dark:text-amber-400",
                        name === s && "border-brand bg-brand/10",
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !trimmed || duplicate}>
              {saving ? "Creating…" : "Create environment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
