import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AssetDropzone } from "@/components/asset-dropzone";
import { Timeline } from "@/components/timeline/timeline";
import { authClient } from "@/lib/auth-client";
import { getAssetCollection } from "@/lib/collections/asset";
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
  const assetCollection = getAssetCollection(id);
  const assets = useLiveQuery((q) => q.from({ assets: assetCollection }));

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
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl">{project.data.name}</h1>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            <span>ID: {project.data.id.slice(0, 8)}...</span>
            <span>
              Updated: {new Date(project.data.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Upload Section */}
        <div className="shrink-0 border-b bg-muted/30 p-4">
          <h2 className="mb-2 font-semibold text-sm">Upload Media</h2>
          <AssetDropzone assetCollection={assetCollection} projectId={id} />
        </div>

        {/* Timeline Section */}
        <div className="flex-1 overflow-auto p-4">
          <Timeline
            assets={assets.data ?? []}
            onAssetDelete={(assetId) => assetCollection.delete(assetId)}
            tracks={project.data.tracks}
          />
        </div>
      </div>
    </div>
  );
}
