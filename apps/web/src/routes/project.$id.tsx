import { useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AssetDropzone } from "@/components/asset-dropzone";
import { AssetThumbnail } from "@/components/asset-thumbnail";
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
    <div className="container mx-auto p-8">
      <h1 className="mb-4 font-bold text-3xl">{project.data.name}</h1>

      <div className="mb-6">
        <h2 className="mb-3 font-semibold text-lg">Tracks</h2>
        {project.data.tracks.length > 0 ? (
          <div className="space-y-2">
            {project.data.tracks.map((track) => (
              <div
                className="flex items-center gap-3 rounded-md border bg-muted/50 p-3"
                key={track.id}
              >
                <span
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    track.type === "video"
                      ? "bg-blue-500/20 text-blue-500"
                      : "bg-green-500/20 text-green-500"
                  }`}
                >
                  {track.type}
                </span>
                <span className="font-medium">{track.name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No tracks</p>
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-3 font-semibold text-lg">Assets</h2>
        <AssetDropzone assetCollection={assetCollection} projectId={id} />

        {assets.data?.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {assets.data.map((asset) => (
              <AssetThumbnail
                asset={asset}
                key={asset.id}
                onDelete={() => assetCollection.delete(asset.id)}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 text-muted-foreground text-sm">
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
