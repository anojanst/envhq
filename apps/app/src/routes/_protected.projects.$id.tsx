import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/projects/$id")({
  component: ProjectLayout,
});

function ProjectLayout() {
  const { id } = Route.useParams();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <nav className="flex gap-4 border-b border-border pb-4 text-sm">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
          Dashboard
        </Link>
      </nav>
      <h1 className="text-lg font-semibold">Project {id}</h1>
      <Outlet />
    </div>
  );
}
