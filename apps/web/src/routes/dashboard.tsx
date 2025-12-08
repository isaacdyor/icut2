import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard")({
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
  const { session } = Route.useRouteContext();
  const [newProjectName, setNewProjectName] = useState("");

  const projects = useQuery(orpc.project.getAll.queryOptions());

  const createProject = useMutation(
    orpc.project.create.mutationOptions({
      onSuccess: () => {
        projects.refetch();
        setNewProjectName("");
      },
    }),
  );

  const handleCreate = () => {
    if (newProjectName.trim()) {
      createProject.mutate({ name: newProjectName });
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="mb-2 font-bold text-3xl">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome {session.data?.user.name}
        </p>
      </div>

      <div className="mb-6">
        <h2 className="mb-4 font-semibold text-xl">Projects</h2>
        <div className="mb-6 flex gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2"
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreate();
              }
            }}
            placeholder="New project name"
            type="text"
            value={newProjectName}
          />
          <Button disabled={!newProjectName.trim()} onClick={handleCreate}>
            Create Project
          </Button>
        </div>

        {projects.isLoading ? (
          <p>Loading projects...</p>
        ) : projects.data?.length === 0 ? (
          <p className="text-muted-foreground">
            No projects yet. Create one to get started!
          </p>
        ) : (
          <div className="grid gap-4">
            {projects.data?.map((project) => (
              <Link
                className="block rounded-lg border p-4 transition-colors hover:bg-accent"
                key={project.id}
                params={{ id: project.id }}
                to="/project/$id"
              >
                <h3 className="font-medium">{project.name}</h3>
                <p className="text-muted-foreground text-sm">
                  Created {new Date(project.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
