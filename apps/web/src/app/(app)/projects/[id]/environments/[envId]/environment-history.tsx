"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/client";

interface VersionEntry {
  version: number;
  message: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export function EnvironmentHistory({ environmentId }: { environmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  // Starts true: the mount effect below kicks off a fetch immediately.
  const [loading, setLoading] = useState(true);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ versions: VersionEntry[] }>(
        `/api/environments/${environmentId}/versions`,
      );
      setVersions(data.versions);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Fetch once on mount too (not just when the sheet opens) — the always-
  // visible summary strip below needs a version to show before the user
  // ever opens the sheet.
  useEffect(() => {
    let ignore = false;
    api<{ versions: VersionEntry[] }>(`/api/environments/${environmentId}/versions`)
      .then((data) => {
        if (!ignore) setVersions(data.versions);
      })
      .catch((err) => {
        if (!ignore) toast.error((err as Error).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [environmentId]);

  async function rollback(version: number) {
    // Use the newest entry from the versions list we just loaded when the
    // sheet opened — not a version number captured once at page load, which
    // would go stale the moment any other edit (e.g. via the var editor)
    // bumps the real server version without a full page reload.
    const liveVersion = versions?.[0]?.version;
    if (liveVersion === undefined) return;

    setRollingBack(true);
    try {
      await api(`/api/environments/${environmentId}/versions/${version}/rollback`, {
        method: "POST",
        body: { baseVersion: liveVersion },
      });
      toast.success(`Rolled back to v${version}`);
      setRollbackTarget(null);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRollingBack(false);
    }
  }

  const latest = versions?.[0];

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {latest ? (
            <>
              <span className="font-medium text-foreground">v{latest.version}</span>
              {" · updated "}
              {formatRelativeTime(latest.createdAt)}
              {" by "}
              {latest.createdByName}
            </>
          ) : versions ? (
            "No history yet"
          ) : (
            "Loading…"
          )}
        </span>
        <Sheet
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) load();
          }}
        >
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <HistoryIcon className="size-4" /> History
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Version history</SheetTitle>
              <SheetDescription>Every change to this environment, newest first.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
              {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!loading && versions?.length === 0 && (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              )}
              {versions?.map((v, i) => (
                <div
                  key={v.version}
                  className="flex items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      v{v.version}
                      {v.message ? ` · ${v.message}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {i !== 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setRollbackTarget(v.version)}
                    >
                      Roll back
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <AlertDialog
        open={rollbackTarget !== null}
        onOpenChange={(next) => !next && setRollbackTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to v{rollbackTarget}?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the environment to its state at v{rollbackTarget}. It creates a new
              version — nothing is lost, and you can roll forward again from history afterward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rollingBack}
              onClick={() => rollbackTarget !== null && rollback(rollbackTarget)}
            >
              {rollingBack ? "Rolling back…" : "Roll back"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
