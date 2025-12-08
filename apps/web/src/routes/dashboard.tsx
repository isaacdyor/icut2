import { useLiveQuery } from "@tanstack/react-db";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { db } from "@/lib/db";

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

  const projects = useLiveQuery((q) => q.from({ projects: db.projects }));

  const form = useForm({
    defaultValues: {
      name: "",
    },
    onSubmit: ({ value }) => {
      if (value.name.trim()) {
        db.projects.insert({
          id: crypto.randomUUID(),
          name: value.name,
          userId: session.data?.user.id ?? "",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        form.reset();
      }
    },
  });

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
        <form
          className="mb-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => {
                if (!value) {
                  return "A project name is required";
                }
                if (value.length < 1) {
                  return "Project name must be at least 1 character";
                }
              },
            }}
          >
            {(field) => (
              <>
                <input
                  className="flex-1 rounded-md border px-3 py-2"
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="New project name"
                  type="text"
                  value={field.state.value}
                />
                <Button disabled={!field.state.value.trim()} type="submit">
                  Create Project
                </Button>
              </>
            )}
          </form.Field>
        </form>

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
                  Created {project.createdAt.toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
