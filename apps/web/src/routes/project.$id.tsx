import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/project/$id")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({
        to: "/login",
        throw: true,
      });
    }
    return { session };
  },
});

function RouteComponent() {
  const { id } = Route.useParams();
  const project = useQuery(
    orpc.project.getById.queryOptions({ input: { id } })
  );

  if (project.isLoading) {
    return (
      <div className="container mx-auto p-8">
        <p>Loading project...</p>
      </div>
    );
  }

  if (project.error || !project.data) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-destructive">Project not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-4 font-bold text-3xl">{project.data.name}</h1>
      <div className="space-y-2">
        <p>
          <span className="font-medium">ID:</span> {project.data.id}
        </p>
        <p>
          <span className="font-medium">Created:</span>{" "}
          {new Date(project.data.createdAt).toLocaleString()}
        </p>
        <p>
          <span className="font-medium">Last Updated:</span>{" "}
          {new Date(project.data.updatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
