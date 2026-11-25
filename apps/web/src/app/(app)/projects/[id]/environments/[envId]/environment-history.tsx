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

/** How many versions the panel shows before "See all". */
const PANEL_ENTRIES = 4;

function VersionLabel({ v, current }: { v: VersionEntry; current?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        v{v.version}
        {current && (
          <span className="rounded-md bg-brand/15 px-1.5 text-[11px] font-medium text-brand">Current</span>
        )}
      </span>
      {v.message && <span className="truncate text-xs text-foreground/80">{v.message}</span>}
      <span className="text-xs text-muted-foreground" title={new Date(v.createdAt).toLocaleString()}>
        {v.createdByName} · {formatRelativeTime(v.createdAt)}
      </span>
    </div>
  );
}

export function EnvironmentHistory({
  environmentId,
  revision,
}: {
  environmentId: string;
  /** Changes when the environment's values do — refetch then. */
  revision?: string;
}) {
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
  }, [environmentId, revision]);

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
  const recent = versions?.slice(0, PANEL_ENTRIES) ?? [];

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="history-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="history-heading" className="flex items-center gap-2 text-sm font-semibold">
            <HistoryIcon className="size-4 text-muted-foreground" aria-hidden />
            History
          </h2>
          <Sheet
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (next) load();
            }}
          >
            <SheetTrigger render={<Button variant="ghost" size="xs" disabled={!latest} />}>
              {versions && versions.length > PANEL_ENTRIES ? `See all ${versions.length}` : "Open"}
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
                    className="flex items-center justify-between gap-2 rounded-xl bg-muted/60 p-3"
                  >
                    <VersionLabel v={v} />
                    {i !== 0 && (
                      <Button size="sm" variant="outline" onClick={() => setRollbackTarget(v.version)}>
                        Roll back
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {versions === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No changes yet. Every save becomes a version you can roll back to.
          </p>
        ) : (
          <ol className="flex flex-col">
            {recent.map((v, i) => (
              <li key={v.version} className="group/entry relative flex gap-3 pb-4 last:pb-0">
                {/* the timeline: a dot per version, joined by a hairline */}
                <span className="relative flex w-2.5 shrink-0 justify-center pt-1.5" aria-hidden>
                  <span className={i === 0 ? "size-2.5 rounded-full bg-brand ring-4 ring-brand/20" : "size-2 rounded-full bg-muted-foreground/50"} />
                  {i < recent.length - 1 && <span className="absolute top-4 -bottom-0.5 w-px bg-border" />}
                </span>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                  <VersionLabel v={v} current={i === 0} />
                  {i !== 0 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="shrink-0 opacity-70 group-hover/entry:opacity-100"
                      onClick={() => setRollbackTarget(v.version)}
                    >
                      Roll back
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AlertDialog
        open={rollbackTarget !== null}
        onOpenChange={(next) => !next && setRollbackTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to v{rollbackTarget}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every key goes back to how it was at v{rollbackTarget}: keys added since are removed,
              changed values are restored. It&rsquo;s saved as a new version, so you can undo it from
              history.
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
