"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellOff, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/client";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface OpsIssue {
  fingerprint: string;
  route: string;
  kind: string;
  message: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  release: string | null;
  muted: boolean;
}

/**
 * The issue list, with muting (RM-18).
 *
 * Muting exists because of the ticket's second gotcha: an alert that fires
 * constantly is an alert nobody reads, and the usual cause is a known,
 * accepted failure that nobody can silence. Without a way to mute one, the
 * only way to stop it is to stop reading alerts — which takes the real ones
 * with it.
 */
export function OpsIssues({ initialIssues }: { initialIssues: OpsIssue[] }) {
  const [issues, setIssues] = useState(initialIssues);

  async function toggleMute(issue: OpsIssue) {
    const muted = !issue.muted;
    try {
      await api(`/api/ops/issues/${issue.fingerprint}`, { method: "PATCH", body: { muted } });
      setIssues((prev) => prev.map((i) => (i.fingerprint === issue.fingerprint ? { ...i, muted } : i)));
      toast.success(muted ? "Muted — it won't alert again" : "Unmuted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Issue</TableHead>
            <TableHead className="w-24 text-right">Seen</TableHead>
            <TableHead className="w-32">Last</TableHead>
            <TableHead className="w-28">Release</TableHead>
            <TableHead className="w-16 text-right">Alerts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                Nothing has failed. That is either good news or a broken reporter — throw a
                deliberate error to check.
              </TableCell>
            </TableRow>
          ) : (
            issues.map((issue) => (
              <TableRow key={issue.fingerprint} className={cn(issue.muted && "opacity-50")}>
                <TableCell>
                  <span className="block font-medium">
                    {issue.kind} <span className="font-mono text-xs text-muted-foreground">{issue.route}</span>
                  </span>
                  <span className="block max-w-xl truncate text-xs text-muted-foreground">
                    {issue.message}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{issue.occurrences}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatRelativeTime(issue.lastSeenAt)}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {issue.release ? issue.release.slice(0, 8) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={issue.muted ? `Unmute ${issue.kind}` : `Mute ${issue.kind}`}
                    onClick={() => toggleMute(issue)}
                  >
                    {issue.muted ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
