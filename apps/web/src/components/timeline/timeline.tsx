import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback, useRef, useState } from "react";
import type { createClipMutations } from "@/lib/collections/project";
import type { Asset, Clip, Track } from "@/lib/types";
import {
  DEFAULT_CLIP_DURATION_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  msToPx,
  pxToMs,
  snapToGrid,
  TRACK_LABEL_WIDTH,
  ZOOM_STEP,
} from "./constants";
import { DraggableAsset } from "./draggable-asset";
import { DroppableTrack } from "./droppable-track";
import { TimeRuler } from "./time-ruler";

type TimelineProps = {
  assets: Asset[];
  tracks: Track[];
  clipMutations: ReturnType<typeof createClipMutations>;
  onAssetDelete: (assetId: string) => void;
};

type DragType = "asset" | "clip";

type DragState = {
  type: DragType | null;
  activeAsset: Asset | null;
  activeClip: Clip | null;
  previewTrackId: string | null;
  previewPositionMs: number | null;
};

export function Timeline({
  assets,
  tracks,
  clipMutations,
  onAssetDelete,
}: TimelineProps) {
  const [zoom, setZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    type: null,
    activeAsset: null,
    activeClip: null,
    previewTrackId: null,
    previewPositionMs: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);

  const maxClipEndMs = Math.max(
    ...tracks.flatMap((t) => t.clips.map((c) => c.startMs + c.durationMs)),
    30_000
  );
  const timelineDurationMs = Math.ceil(maxClipEndMs / 5000) * 5000 + 10_000;
  const timelineWidth = msToPx(timelineDurationMs, zoom);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const calculatePositionFromEvent = useCallback(
    (clientX: number, trackId: string): number => {
      const trackElement = document.getElementById(`track-${trackId}`);
      if (!trackElement) {
        return 0;
      }
      const trackRect = trackElement.getBoundingClientRect();
      const relativeX = clientX - trackRect.left - TRACK_LABEL_WIDTH;
      return snapToGrid(Math.max(0, pxToMs(relativeX, zoom)), 100);
    },
    [zoom]
  );

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);

    if (activeId.startsWith("clip-")) {
      const clipData = event.active.data.current as
        | { type: "clip"; clip: Clip }
        | undefined;
      if (clipData?.clip) {
        setDragState({
          type: "clip",
          activeAsset: null,
          activeClip: clipData.clip,
          previewTrackId: null,
          previewPositionMs: null,
        });
        return;
      }
    }

    const asset = assets.find((a) => a.id === activeId);
    if (asset) {
      setDragState({
        type: "asset",
        activeAsset: asset,
        activeClip: null,
        previewTrackId: null,
        previewPositionMs: null,
      });
    }
  }

  function handleDragMove(event: DragMoveEvent) {
    const { over, activatorEvent } = event;

    if (!over) {
      setDragState((prev) => ({
        ...prev,
        previewTrackId: null,
        previewPositionMs: null,
      }));
      return;
    }

    const mouseEvent = activatorEvent as MouseEvent;
    const currentX = mouseEvent.clientX + event.delta.x;
    const positionMs = calculatePositionFromEvent(currentX, String(over.id));

    setDragState((prev) => ({
      ...prev,
      previewTrackId: String(over.id),
      previewPositionMs: positionMs,
    }));
  }

  const handleAssetDrop = useCallback(
    (assetId: string, trackId: string, positionMs: number) => {
      const droppedAsset = assets.find((a) => a.id === assetId);
      const targetTrack = tracks.find((t) => t.id === trackId);

      if (droppedAsset && targetTrack) {
        clipMutations.insert({
          trackId: targetTrack.id,
          assetId: droppedAsset.id,
          startMs: positionMs,
          durationMs: DEFAULT_CLIP_DURATION_MS,
        });
      }
    },
    [assets, tracks, clipMutations]
  );

  const handleClipReposition = useCallback(
    (clip: Clip, newPositionMs: number) => {
      if (newPositionMs !== clip.startMs) {
        clipMutations.update(clip.id, { startMs: newPositionMs });
      }
    },
    [clipMutations]
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const { type, activeClip, previewPositionMs } = dragState;

    if (over && previewPositionMs !== null) {
      const trackId = String(over.id);

      if (type === "asset") {
        handleAssetDrop(String(active.id), trackId, previewPositionMs);
      }

      if (type === "clip" && activeClip) {
        handleClipReposition(activeClip, previewPositionMs);
      }
    }

    setDragState({
      type: null,
      activeAsset: null,
      activeClip: null,
      previewTrackId: null,
      previewPositionMs: null,
    });
  }

  function handleClipDelete(clipId: string) {
    clipMutations.delete(clipId);
  }

  const getPreviewForTrack = useCallback(
    (trackId: string) => {
      if (dragState.previewTrackId !== trackId) {
        return null;
      }
      if (dragState.previewPositionMs === null) {
        return null;
      }

      const durationMs =
        dragState.activeClip?.durationMs ?? DEFAULT_CLIP_DURATION_MS;

      return {
        positionMs: dragState.previewPositionMs,
        durationMs,
        isClip: dragState.type === "clip",
      };
    },
    [dragState]
  );

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <div className="flex h-full min-h-0 flex-col gap-4">
        {/* Assets Panel */}
        <div className="shrink-0 rounded-lg border bg-card p-4">
          <h3 className="mb-3 font-medium text-muted-foreground text-sm">
            Media Assets
          </h3>
          {assets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {assets.map((asset) => (
                <DraggableAsset
                  asset={asset}
                  key={asset.id}
                  onDelete={() => onAssetDelete(asset.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No assets yet. Upload some media files above.
            </p>
          )}
        </div>

        {/* Timeline */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border bg-card">
          {/* Timeline Header with Zoom Controls */}
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
            <h3 className="font-medium text-muted-foreground text-sm">
              Timeline
            </h3>
            <div className="flex items-center gap-2">
              <button
                aria-label="Zoom out"
                className="flex h-7 w-7 items-center justify-center rounded border bg-background text-sm transition-colors hover:bg-muted disabled:opacity-50"
                disabled={zoom <= MIN_ZOOM}
                onClick={handleZoomOut}
                type="button"
              >
                −
              </button>
              <span className="min-w-12 text-center font-mono text-muted-foreground text-xs">
                {Math.round(zoom * 100)}%
              </span>
              <button
                aria-label="Zoom in"
                className="flex h-7 w-7 items-center justify-center rounded border bg-background text-sm transition-colors hover:bg-muted disabled:opacity-50"
                disabled={zoom >= MAX_ZOOM}
                onClick={handleZoomIn}
                type="button"
              >
                +
              </button>
            </div>
          </div>

          {/* Scrollable Timeline Container */}
          <div
            className="min-h-0 flex-1 overflow-auto"
            ref={scrollContainerRef}
          >
            <div
              style={{
                width: `${timelineWidth + TRACK_LABEL_WIDTH}px`,
              }}
            >
              {/* Time Ruler */}
              <TimeRuler durationMs={timelineDurationMs} zoom={zoom} />

              {/* Tracks */}
              {sortedTracks.map((track) => (
                <div id={`track-${track.id}`} key={track.id}>
                  <DroppableTrack
                    assets={assets}
                    draggedClipId={dragState.activeClip?.id ?? null}
                    onClipDelete={handleClipDelete}
                    preview={getPreviewForTrack(track.id)}
                    timelineWidth={timelineWidth}
                    track={track}
                    zoom={zoom}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndContext>
  );
}
