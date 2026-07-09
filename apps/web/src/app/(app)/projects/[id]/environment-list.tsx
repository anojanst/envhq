"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, MoreVertical, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/client";

interface EnvItem {
  id: string;
  name: string;
  varCount: number;
}

export function EnvironmentList({
  projectId,
  environments,
}: {
  projectId: string;
  environments: EnvItem[];
}) {
  const router = useRouter();

  async function remove(env: EnvItem) {
    if (!confirm(`Delete environment "${env.name}" and all its variables?`)) return;
    try {
      await api(`/api/environments/${env.id}`, { method: "DELETE" });
      toast.success(`Deleted "${env.name}"`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (environments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <Layers className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No environments yet. Add one like <code>dev</code> or <code>prod</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {environments.map((env) => (
        <Card key={env.id} className="relative transition-colors hover:border-primary">
          <CardHeader>
            <div className="flex items-start justify-between">
              <Link
                href={`/projects/${projectId}/environments/${env.id}`}
                className="flex-1"
              >
                <CardTitle>{env.name}</CardTitle>
                <CardDescription className="mt-1">
                  {env.varCount} variable{env.varCount === 1 ? "" : "s"}
                </CardDescription>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-7" />}
                >
                  <MoreVertical className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => remove(env)}
                  >
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
