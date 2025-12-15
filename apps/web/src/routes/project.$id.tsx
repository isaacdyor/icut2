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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { usePlaybackEngine } from "@/lib/playback";
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
  const playback = usePlaybackEngine();
  const [playheadMs, setPlayheadMs] = useState(0);
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

  const maxClipEndMs = Math.max(
    ...projectData.tracks.flatMap((t) =>
      t.clips.map((c) => c.startMs + c.durationMs)
    ),
    30_000
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const getActiveVideoAtTime = useCallback(
    (timeMs: number) => {
      const videoTrack = projectData.tracks.find((t) => t.type === "video");
      if (!videoTrack) {
        return { clip: null, asset: null, localTimeMs: 0 };
      }

      const clip = videoTrack.clips.find(
        (c) => timeMs >= c.startMs && timeMs < c.startMs + c.durationMs
      );
      if (!clip) {
        return { clip: null, asset: null, localTimeMs: 0 };
      }

      const asset =
        projectData.assets.find((a) => a.id === clip.assetId) ?? null;
      return { clip, asset, localTimeMs: Math.max(0, timeMs - clip.startMs) };
    },
    [projectData.assets, projectData.tracks]
  );

  const loadedUrlRef = useRef<string | null>(null);
  const loadInFlightRef = useRef<{
    url: string;
    promise: Promise<void>;
  } | null>(null);
  const loadAndSeek = useCallback(
    async (url: string, localTimeMs: number) => {
      const fetchableUrl = import.meta.env.DEV
        ? `/__media_proxy?url=${encodeURIComponent(url)}`
        : url;

      if (loadedUrlRef.current !== fetchableUrl) {
        loadedUrlRef.current = fetchableUrl;
        const inFlight = loadInFlightRef.current;
        if (inFlight?.url === fetchableUrl) {
          await inFlight.promise;
        } else {
          const promise = playback.load(fetchableUrl);
          loadInFlightRef.current = { url: fetchableUrl, promise };
          try {
            await promise;
          } finally {
            if (loadInFlightRef.current?.url === fetchableUrl) {
              loadInFlightRef.current = null;
            }
          }
        }
      }
      // Avoid triggering mp4box seek at t=0 (it returns a byte offset and can require re-append).
      // Starting from 0 works without an explicit seek.
      if (localTimeMs > 0) {
        playback.seek(localTimeMs);
      }
    },
    [playback]
  );

  const findNextVideoClipStart = useCallback(
    (timeMs: number) => {
      const videoTrack = projectData.tracks.find((t) => t.type === "video");
      if (!videoTrack) {
        return null;
      }
      return (
        videoTrack.clips
          .filter((c) => c.startMs >= timeMs)
          .sort((a, b) => a.startMs - b.startMs)[0] ?? null
      );
    },
    [projectData.tracks]
  );

  const handleSeek = useCallback(
    (timeMs: number) => {
      const clamped = Math.max(0, Math.min(timeMs, maxClipEndMs));
      setPlayheadMs(clamped);

      const { asset, localTimeMs } = getActiveVideoAtTime(clamped);
      if (asset?.type === "video" && asset.url) {
        loadAndSeek(asset.url, localTimeMs).catch((error) => {
          // Hook stores the error for UI; also log for debugging.
          // eslint-disable-next-line no-console
          console.error(error);
        });
      } else {
        playback.pause();
      }
    },
    [getActiveVideoAtTime, loadAndSeek, maxClipEndMs, playback]
  );

  const playFromTime = useCallback(
    async (timeMs: number) => {
      // If we're not on a video clip, jump to the next one.
      const { clip, asset, localTimeMs } = getActiveVideoAtTime(timeMs);
      if (asset?.type === "video" && asset.url && clip) {
        await loadAndSeek(asset.url, localTimeMs);
        playback.play();
        return;
      }

      const nextClip = findNextVideoClipStart(timeMs);
      if (!nextClip) {
        return;
      }

      const nextAsset =
        projectData.assets.find((a) => a.id === nextClip.assetId) ?? null;
      if (nextAsset?.type !== "video" || !nextAsset.url) {
        return;
      }

      setPlayheadMs(nextClip.startMs);
      await loadAndSeek(nextAsset.url, 0);
      playback.play();
    },
    [
      findNextVideoClipStart,
      getActiveVideoAtTime,
      loadAndSeek,
      playback,
      projectData.assets,
    ]
  );

  const handlePlayPause = useCallback(() => {
    if (playback.isPlaying) {
      playback.pause();
      return;
    }

    playFromTime(playheadMs).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
    });
  }, [playFromTime, playheadMs, playback]);

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

  const activeVideo = useMemo(
    () => getActiveVideoAtTime(playheadMs),
    [getActiveVideoAtTime, playheadMs]
  );

  // While playing, drive the global playhead from the engine's local time.
  useEffect(() => {
    if (!playback.isPlaying) {
      return;
    }
    if (!activeVideo.clip) {
      return;
    }
    const nextGlobal = activeVideo.clip.startMs + playback.currentTimeMs;
    setPlayheadMs(Math.min(nextGlobal, maxClipEndMs));
  }, [
    activeVideo.clip,
    maxClipEndMs,
    playback.currentTimeMs,
    playback.isPlaying,
  ]);

  // Auto-advance to the next clip when current one ends.
  useEffect(() => {
    if (!playback.isPlaying) {
      return;
    }
    if (!activeVideo.clip) {
      return;
    }

    const clip = activeVideo.clip;
    if (playback.currentTimeMs < clip.durationMs) {
      return;
    }

    const videoTrack = projectData.tracks.find((t) => t.type === "video");
    const nextClip =
      videoTrack?.clips
        .filter((c) => c.startMs >= clip.startMs + clip.durationMs)
        .sort((a, b) => a.startMs - b.startMs)[0] ?? null;

    if (!nextClip) {
      playback.pause();
      setPlayheadMs(Math.min(clip.startMs + clip.durationMs, maxClipEndMs));
      return;
    }

    const nextAsset =
      projectData.assets.find((a) => a.id === nextClip.assetId) ?? null;
    if (nextAsset?.type !== "video" || !nextAsset.url) {
      playback.pause();
      setPlayheadMs(Math.min(clip.startMs + clip.durationMs, maxClipEndMs));
      return;
    }

    setPlayheadMs(nextClip.startMs);
    loadAndSeek(nextAsset.url, 0)
      .then(() => playback.play())
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        playback.pause();
      });
  }, [
    activeVideo.clip,
    loadAndSeek,
    maxClipEndMs,
    playback,
    projectData.assets,
    projectData.tracks,
  ]);

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
              clipTimeMs={activeVideo.localTimeMs}
              currentTimeMs={playheadMs}
              durationMs={maxClipEndMs}
              onSeek={handleSeek}
              playback={playback}
              videoAsset={activeVideo.asset}
            />
          </div>
        </div>

        {/* Bottom Section: Timeline */}
        <div className="h-64 shrink-0 p-2 pt-0">
          <Timeline
            assets={projectData.assets}
            clipMutations={clipMutations}
            currentTimeMs={playheadMs}
            dragState={dragState}
            isPlaying={playback.isPlaying}
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
