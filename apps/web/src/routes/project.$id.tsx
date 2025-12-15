import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { AssetDropzone } from "@/components/asset-dropzone";
import { Timeline } from "@/components/timeline/timeline";
import { authClient } from "@/lib/auth-client";
import {
  createAssetMutations,
  createClipMutations,
  getProjectCollection,
} from "@/lib/collections/project";

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
  const projectCollection = getProjectCollection(id);

  const project = useLiveQuery((q) => q.from({ project: projectCollection }));
  const projectData = project.data?.[0];

  if (!projectData) {
    return (
      <div className="container mx-auto p-8">
        <p>Loading project...</p>
      </div>
    );
  }

  return (
    <ProjectView
      projectCollection={projectCollection}
      projectData={projectData}
      projectId={id}
    />
  );
}

type ProjectData = Parameters<typeof createAssetMutations>[1];

function ProjectView({
  projectId,
  projectCollection,
  projectData,
}: {
  projectId: string;
  projectCollection: ReturnType<typeof getProjectCollection>;
  projectData: ProjectData;
}) {
  const assetMutations = useMemo(
    () => createAssetMutations(projectCollection, projectData),
    [projectCollection, projectData]
  );
  const clipMutations = useMemo(
    () => createClipMutations(projectCollection, projectData),
    [projectCollection, projectData]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-2xl">{projectData.name}</h1>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            <span>ID: {projectData.id.slice(0, 8)}...</span>
            <span>
              Updated: {new Date(projectData.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Upload Section */}
        <div className="shrink-0 border-b bg-muted/30 p-4">
          <h2 className="mb-2 font-semibold text-sm">Upload Media</h2>
          <AssetDropzone
            assetMutations={assetMutations}
            projectId={projectId}
          />
        </div>

        {/* Timeline Section */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <Timeline
            assets={projectData.assets}
            clipMutations={clipMutations}
            onAssetDelete={(assetId) => assetMutations.delete(assetId)}
            tracks={projectData.tracks}
          />
        </div>
      </div>
    </div>
  );
}
