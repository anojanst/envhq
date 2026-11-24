import { ProjectAvatar } from "@/components/project-visuals";
import { HeaderTabs, PageHeader } from "@/components/page-header";
import { ProjectActions } from "@/app/(app)/projects/[id]/project-actions";

export type ProjectSection = "variables" | "access" | "deploy-keys";

/**
 * Every project page shares this header: where you are, the project, and its
 * sections as tabs. Access and Deploy keys used to hide in the ⋮ menu; they
 * are half of what an admin comes here to do.
 *
 * Access and Deploy keys are admin-only (their pages 404 otherwise), so
 * non-admins see Variables alone and no tab bar at all.
 */
export function ProjectHeader({
  project,
  section,
  isAdmin,
  firstEnvironmentId,
  stats,
}: {
  project: { id: string; name: string };
  section: ProjectSection;
  isAdmin: boolean;
  /** Where the Variables tab goes when you're on another section. */
  firstEnvironmentId?: string | null;
  /** Feeds the delete confirmation. Omitted on pages that don't offer project actions. */
  stats?: { environmentCount: number; variableCount: number; hasProdEnv: boolean };
}) {
  const base = `/projects/${project.id}`;
  const variablesHref = firstEnvironmentId ? `${base}/environments/${firstEnvironmentId}` : base;

  return (
    <PageHeader
      crumbs={[{ label: "Projects", href: "/dashboard" }]}
      leading={<ProjectAvatar name={project.name} />}
      title={project.name}
      actions={
        isAdmin &&
        stats && (
        <ProjectActions
          project={project}
          environmentCount={stats.environmentCount}
          variableCount={stats.variableCount}
          hasProdEnv={stats.hasProdEnv}
        />
        )
      }
    >
      {isAdmin && (
        <HeaderTabs
          tabs={[
            { label: "Variables", href: variablesHref, active: section === "variables" },
            { label: "Access", href: `${base}/access`, active: section === "access" },
            { label: "Deploy keys", href: `${base}/deploy-keys`, active: section === "deploy-keys" },
          ]}
        />
      )}
    </PageHeader>
  );
}
