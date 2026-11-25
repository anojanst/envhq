"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Layers, SearchX, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ProjectAvatar, EnvBadge, projectTint } from "@/components/project-visuals";
import { cn, nativeSelectClass } from "@/lib/utils";

export interface OrgOption {
  id: string;
  name: string;
}

// Compact page-number window with ellipses for larger counts.
function pageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "ellipsis")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push("ellipsis");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

export interface ProjectListItem {
  id: string;
  name: string;
  createdLabel: string;
  envs: string[];
  variableCount: number;
  /** When a value last changed in the last two weeks; null if it hasn't. */
  updatedLabel: string | null;
  /** Changes per day, oldest first, over the last two weeks. */
  activity: number[];
  orgId: string;
  orgName: string;
}

const PAGE_SIZE = 9;
const ALL_ORGS = "";

export function ProjectsBrowser({
  projects,
  orgs,
}: {
  projects: ProjectListItem[];
  orgs: OrgOption[];
}) {
  const [query, setQuery] = useState("");
  const [orgFilter, setOrgFilter] = useState(ALL_ORGS);
  const [page, setPage] = useState(1);
  const multiOrg = orgs.length > 1;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (orgFilter && p.orgId !== orgFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.envs.some((e) => e.toLowerCase().includes(q)) ||
        p.orgName.toLowerCase().includes(q)
      );
    });
  }, [projects, query, orgFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  function onSearch(value: string) {
    setQuery(value);
    setPage(1);
  }

  function onOrgFilterChange(value: string) {
    setOrgFilter(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div role="search" className="relative w-full flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Filter projects and environments"
            className="pr-8 pl-8"
            aria-label="Filter projects"
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => onSearch("")}
              aria-label="Clear filter"
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {multiOrg ? (
          <select
            className={nativeSelectClass}
            value={orgFilter}
            onChange={(e) => onOrgFilterChange(e.target.value)}
            aria-label="Filter by team"
          >
            <option value={ALL_ORGS}>All teams</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 py-16 text-center">
          <SearchX className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {query.trim() ? (
              <>
                No projects match{" "}
                <span className="font-medium text-foreground">“{query.trim()}”</span>.
              </>
            ) : (
              <>
                No projects in{" "}
                <span className="font-medium text-foreground">
                  {orgs.find((o) => o.id === orgFilter)?.name ?? "this team"}
                </span>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((project) => (
              <ProjectCard key={project.id} project={project} showOrg={multiOrg} />
            ))}
          </div>

          {pageCount > 1 ? (
            <div className="flex flex-col items-center gap-2 pt-1 sm:flex-row sm:justify-between">
              <p className="text-xs text-muted-foreground tabular-nums">
                {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      aria-disabled={current <= 1}
                      className={
                        current <= 1 ? "pointer-events-none opacity-50" : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (current > 1) setPage(current - 1);
                      }}
                    />
                  </PaginationItem>
                  {pageWindow(current, pageCount).map((p, i) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === current}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(p);
                          }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      aria-disabled={current >= pageCount}
                      className={
                        current >= pageCount
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (current < pageCount) setPage(current + 1);
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ProjectCard({ project, showOrg }: { project: ProjectListItem; showOrg: boolean }) {
  const shown = project.envs.slice(0, 3);
  const overflow = project.envs.length - shown.length;
  const tint = projectTint(project.name);
  const changes = project.activity.reduce((a, b) => a + b, 0);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full gap-4 pb-0 transition-all duration-200 ease-fluid group-hover:-translate-y-0.5 group-hover:shadow-lg">
        <CardHeader>
          <div className="flex items-start gap-3">
            <ProjectAvatar name={project.name} className="size-10 rounded-xl after:rounded-xl" />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{project.name}</span>
                <ArrowUpRight className="ml-auto size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:text-foreground group-hover:opacity-100" />
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {showOrg ? `${project.orgName} · ` : ""}
                {project.envs.length} environment{project.envs.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight tabular-nums">{project.variableCount}</span>
              <span className="text-sm text-muted-foreground">variable{project.variableCount === 1 ? "" : "s"}</span>
            </p>
            <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", tint.chip)}>
              {project.updatedLabel ? `Updated ${project.updatedLabel}` : `Created ${project.createdLabel}`}
            </span>
          </div>
          {project.envs.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Layers className="size-3.5" /> No environments yet
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {shown.map((name) => (
                <EnvBadge key={name} name={name} />
              ))}
              {overflow > 0 ? (
                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  +{overflow}
                </span>
              ) : null}
            </div>
          )}
        </CardContent>

        <div className={cn("relative mt-auto", tint.text)}>
          <Sparkline values={project.activity} />
          <span className="sr-only">
            {changes} change{changes === 1 ? "" : "s"} in the last two weeks
          </span>
        </div>
      </Card>
    </Link>
  );
}

/**
 * Two weeks of changes as a soft area, edge to edge along the card's foot.
 * A quiet project draws a flat line rather than nothing, so every card keeps
 * the same shape.
 */
function Sparkline({ values }: { values: number[] }) {
  const w = 300;
  const h = 56;
  // A floor on the scale, so a project with one change a day doesn't
  // draw the same full-height wall as one with fifty.
  const max = Math.max(4, ...values);
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 6 - (v / max) * (h - 18)] as const);
  // Catmull-Rom → cubic Bézier, for a curve that passes through every point.
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-14 w-full" aria-hidden>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="currentColor" fillOpacity={0.14} />
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
