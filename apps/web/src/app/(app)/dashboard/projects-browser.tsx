"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Layers, SearchX, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ProjectAvatar, EnvBadge } from "@/components/project-visuals";
import { nativeSelectClass } from "@/lib/utils";
import { CreateProjectDialog } from "./create-project-dialog";

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
  orgId: string;
  orgName: string;
}

const PAGE_SIZE = 9;
const ALL_ORGS = "";

export function ProjectsBrowser({
  projects,
  orgs,
  defaultOrgId,
  callerUserId,
}: {
  projects: ProjectListItem[];
  orgs: OrgOption[];
  defaultOrgId: string;
  callerUserId: string;
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

  // Filtering is live (onChange), so submit is a no-op beyond giving keyboard
  // users an explicit Enter/click affordance inside a role="search" form.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          role="search"
          onSubmit={handleSubmit}
          className="flex w-full flex-1 items-center"
        >
          <div className="relative flex-1">
            <Input
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search projects or environments…"
              className="rounded-r-none pr-8"
              aria-label="Search projects"
              enterKeyHint="search"
            />
            {query ? (
              <button
                type="button"
                onClick={() => onSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <Button
            type="submit"
            variant="outline"
            className="gap-1.5 rounded-l-none border-l-0"
          >
            <Search className="size-4" /> Search
          </Button>
        </form>
        {multiOrg ? (
          <select
            className={nativeSelectClass}
            value={orgFilter}
            onChange={(e) => onOrgFilterChange(e.target.value)}
            aria-label="Filter by organization"
          >
            <option value={ALL_ORGS}>All orgs</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        <CreateProjectDialog orgs={orgs} defaultOrgId={defaultOrgId} callerUserId={callerUserId} />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
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
                  {orgs.find((o) => o.id === orgFilter)?.name ?? "this org"}
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
  const shown = project.envs.slice(0, 4);
  const overflow = project.envs.length - shown.length;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full gap-3 pb-0 ring-foreground/10 transition-all group-hover:shadow-md group-hover:ring-brand/50">
        <CardHeader>
          <div className="flex items-start gap-3">
            <ProjectAvatar name={project.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{project.name}</span>
                <ArrowUpRight className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:text-brand group-hover:opacity-100" />
              </div>
              {showOrg ? (
                <p className="truncate text-xs text-muted-foreground">{project.orgName}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {project.envs.length} environment
                {project.envs.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
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

        <CardFooter className="mt-1 text-xs text-muted-foreground">
          Created {project.createdLabel}
        </CardFooter>
      </Card>
    </Link>
  );
}
