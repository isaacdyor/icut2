import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type Modifier,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useLiveQuery } from "@tanstack/react-db";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { MediaBin } from "@/components/editor/media-bin";
import { PreviewPlayer } from "@/components/editor/preview-player";
import {
  DEFAULT_CLIP_DURATION_MS,
  pxToMs,
  snapToGrid,
  TRACK_LABEL_WIDTH,
} from "@/components/timeline/constants";
import { Timeline } from "@/components/timeline/timeline";
import { authClient } from "@/lib/auth-client";
import {
  createAssetMutations,
  createClipMutations,
  getProjectCollection,
} from "@/lib/collections/project";
import type { Asset } from "@/lib/types";

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

type PreviewClip = {
  id: string;
  assetId: string;
  startMs: number;
  durationMs: number;
};

type DragState = {
  activeClip: PreviewClip | null;
  previewTrackId: string | null;
  previewPositionMs: number | null;
  type: "asset" | "clip" | null;
};

function ProjectView({
  projectId,
  projectCollection,
  projectData,
}: {
  projectId: string;
  projectCollection: ReturnType<typeof getProjectCollection>;
  projectData: ProjectData;
}) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [dragState, setDragState] = useState<DragState>({
    activeClip: null,
    previewTrackId: null,
    previewPositionMs: null,
    type: null,
  });

  const assetMutations = useMemo(
    () => createAssetMutations(projectCollection, projectData),
    [projectCollection, projectData]
  );
  const clipMutations = useMemo(
    () => createClipMutations(projectCollection, projectData),
    [projectCollection, projectData]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSeek = useCallback((timeMs: number) => {
    setCurrentTimeMs(timeMs);
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const activeId = active.id as string;

      const asset = projectData.assets.find((a) => a.id === activeId);
      if (asset) {
        setDragState({
          activeClip: {
            id: `preview-${activeId}`,
            assetId: activeId,
            startMs: 0,
            durationMs: DEFAULT_CLIP_DURATION_MS,
          },
          previewTrackId: null,
          previewPositionMs: null,
          type: "asset",
        });
        return;
      }

      for (const track of projectData.tracks) {
        const clip = track.clips.find((c) => c.id === activeId);
        if (clip) {
          setDragState({
            activeClip: clip,
            previewTrackId: track.id,
            previewPositionMs: clip.startMs,
            type: "clip",
          });
          return;
        }
      }
    },
    [projectData.assets, projectData.tracks]
  );

  const calculateDropPosition = useCallback(
    (event: DragEndEvent): number | null => {
      const { over, delta, activatorEvent } = event;
      if (!over) {
        return null;
      }

      const trackElement = document.getElementById(`track-${over.id}`);
      if (!trackElement) {
        return 0;
      }

      const trackRect = trackElement.getBoundingClientRect();
      const mouseEvent = activatorEvent as MouseEvent;
      const startX = mouseEvent.clientX;
      const currentX = startX + delta.x;
      const relativeX = currentX - trackRect.left - TRACK_LABEL_WIDTH;
      const rawMs = pxToMs(Math.max(0, relativeX));
      return snapToGrid(rawMs);
    },
    []
  );

  const handleAssetDrop = useCallback(
    (activeId: string, trackId: string, dropPositionMs: number) => {
      const asset = projectData.assets.find((a) => a.id === activeId);
      if (asset) {
        clipMutations.insert({
          trackId,
          assetId: asset.id,
          startMs: dropPositionMs,
          durationMs: DEFAULT_CLIP_DURATION_MS,
        });
      }
    },
    [projectData.assets, clipMutations]
  );

  const handleClipDrop = useCallback(
    (clipId: string, currentStartMs: number, dropPositionMs: number) => {
      if (dropPositionMs !== currentStartMs) {
        clipMutations.update(clipId, { startMs: dropPositionMs });
      }
    },
    [clipMutations]
  );

  const resetDragState = useCallback(() => {
    setDragState({
      activeClip: null,
      previewTrackId: null,
      previewPositionMs: null,
      type: null,
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && dragState.activeClip) {
        const dropPositionMs = calculateDropPosition(event);
        if (dropPositionMs !== null) {
          if (dragState.type === "asset") {
            handleAssetDrop(
              active.id as string,
              over.id as string,
              dropPositionMs
            );
          } else if (dragState.type === "clip" && dragState.activeClip) {
            handleClipDrop(
              dragState.activeClip.id,
              dragState.activeClip.startMs,
              dropPositionMs
            );
          }
        }
      }

      resetDragState();
    },
    [
      dragState.activeClip,
      dragState.type,
      calculateDropPosition,
      handleAssetDrop,
      handleClipDrop,
      resetDragState,
    ]
  );

  const handleDragMove = useCallback(
    (event: {
      over: { id: string | number } | null;
      delta: { x: number; y: number };
      activatorEvent: Event;
    }) => {
      if (!(event.over && dragState.activeClip)) {
        return;
      }

      const trackElement = document.getElementById(`track-${event.over.id}`);
      if (!trackElement) {
        return;
      }

      const trackRect = trackElement.getBoundingClientRect();
      const mouseEvent = event.activatorEvent as MouseEvent;
      const startX = mouseEvent.clientX;
      const currentX = startX + event.delta.x;
      const relativeX = currentX - trackRect.left - TRACK_LABEL_WIDTH;
      const rawMs = pxToMs(Math.max(0, relativeX));
      const snappedMs = snapToGrid(rawMs);

      setDragState((prev) => ({
        ...prev,
        previewTrackId: event.over?.id as string,
        previewPositionMs: snappedMs,
      }));
    },
    [dragState.activeClip]
  );

  const restrictToHorizontalAxis: Modifier = ({ transform }) => ({
    ...transform,
    y: 0,
  });

  const maxClipEndMs = Math.max(
    ...projectData.tracks.flatMap((t) =>
      t.clips.map((c) => c.startMs + c.durationMs)
    ),
    30_000
  );

  return (
    <DndContext
      collisionDetection={pointerWithin}
      modifiers={dragState.type === "clip" ? [restrictToHorizontalAxis] : []}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="flex h-full flex-col overflow-hidden">
        {/* Top Section: Media Bin + Preview */}
        <div className="flex min-h-0 flex-1 gap-2 p-2">
          {/* Left: Media Bin */}
          <div className="w-1/2 min-w-0">
            <MediaBin
              assetMutations={assetMutations}
              assets={projectData.assets}
              onAssetDelete={(assetId) => assetMutations.delete(assetId)}
              projectId={projectId}
            />
          </div>

          {/* Right: Preview Player */}
          <div className="w-1/2 min-w-0">
            <PreviewPlayer
              currentTimeMs={currentTimeMs}
              durationMs={maxClipEndMs}
              onSeek={handleSeek}
            />
          </div>
        </div>

        {/* Bottom Section: Timeline */}
        <div className="h-64 shrink-0 p-2 pt-0">
          <Timeline
            assets={projectData.assets}
            clipMutations={clipMutations}
            currentTimeMs={currentTimeMs}
            dragState={dragState}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            tracks={projectData.tracks}
          />
        </div>
      </div>

      <DragOverlay>
        {dragState.activeClip ? (
          <DragOverlayContent
            activeClip={dragState.activeClip}
            assets={projectData.assets}
            type={dragState.type}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DragOverlayContent({
  activeClip,
  assets,
  type,
}: {
  activeClip: PreviewClip;
  assets: Asset[];
  type: "asset" | "clip" | null;
}) {
  const asset = assets.find((a) => a.id === activeClip.assetId);

  if (type === "asset" && asset) {
    return (
      <div className="flex h-16 w-32 items-center justify-center rounded border-2 border-primary bg-primary/20 text-xs shadow-lg">
        {asset.name}
      </div>
    );
  }

  return (
    <div className="flex h-12 items-center justify-center rounded border border-primary bg-primary/30 px-2 text-xs shadow-lg">
      {asset?.name ?? "Clip"}
    </div>
  );
}
