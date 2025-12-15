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
import { useCallback, useState } from "react";
import type { createClipMutations } from "@/lib/collections/project";
import type { Asset, Clip, Track } from "@/lib/types";
import {
  DEFAULT_CLIP_DURATION_MS,
  pxToMs,
  snapToGrid,
  TRACK_LABEL_WIDTH,
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

  const calculatePositionFromEvent = useCallback(
    (clientX: number, trackId: string): number => {
      const trackElement = document.getElementById(`track-${trackId}`);
      if (!trackElement) {
        return 0;
      }
      const trackRect = trackElement.getBoundingClientRect();
      const relativeX = clientX - trackRect.left - TRACK_LABEL_WIDTH;
      return snapToGrid(Math.max(0, pxToMs(relativeX)), 100);
    },
    []
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
      <div className="flex flex-col gap-6">
        {/* Assets Panel */}
        <div className="rounded-lg border bg-card p-4">
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
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-2">
            <h3 className="font-medium text-muted-foreground text-sm">
              Timeline
            </h3>
          </div>

          {/* Time Ruler */}
          <TimeRuler
            durationMs={timelineDurationMs}
            timelineWidth={timelineDurationMs / 20}
          />

          {/* Tracks */}
          <div className="overflow-x-auto">
            {sortedTracks.map((track) => (
              <div id={`track-${track.id}`} key={track.id}>
                <DroppableTrack
                  assets={assets}
                  draggedClipId={dragState.activeClip?.id ?? null}
                  onClipDelete={handleClipDelete}
                  preview={getPreviewForTrack(track.id)}
                  track={track}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </DndContext>
  );
}
