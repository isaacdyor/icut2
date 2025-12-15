import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  pointerWithin,
} from "@dnd-kit/core";
import { useState } from "react";
import type { createClipMutations } from "@/lib/collections/project";
import type { Asset, Track } from "@/lib/types";
import { DraggableAsset } from "./draggable-asset";
import { DroppableTrack } from "./droppable-track";

type TimelineProps = {
  assets: Asset[];
  tracks: Track[];
  clipMutations: ReturnType<typeof createClipMutations>;
  onAssetDelete: (assetId: string) => void;
};

const DEFAULT_CLIP_DURATION_MS = 5000;

export function Timeline({
  assets,
  tracks,
  clipMutations,
  onAssetDelete,
}: TimelineProps) {
  const [activeAsset, setActiveAsset] = useState<Asset | null>(null);

  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order);

  function handleDragStart(event: DragStartEvent) {
    const asset = assets.find((a) => a.id === event.active.id);
    if (asset) {
      setActiveAsset(asset);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveAsset(null);

    if (over) {
      const droppedAsset = assets.find((a) => a.id === active.id);
      const targetTrack = tracks.find((t) => t.id === over.id);

      if (droppedAsset && targetTrack) {
        clipMutations.insert({
          trackId: targetTrack.id,
          assetId: droppedAsset.id,
          startMs: 0,
          durationMs: DEFAULT_CLIP_DURATION_MS,
        });
      }
    }
  }

  function handleClipDelete(clipId: string) {
    clipMutations.delete(clipId);
  }

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
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

        {/* Timeline Tracks */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-2">
            <h3 className="font-medium text-muted-foreground text-sm">
              Timeline
            </h3>
          </div>
          <div className="p-2">
            {sortedTracks.map((track) => (
              <DroppableTrack
                assets={assets}
                key={track.id}
                onClipDelete={handleClipDelete}
                track={track}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeAsset ? (
          <div className="rounded-md border-2 border-primary bg-card p-2 shadow-lg">
            <div className="flex items-center gap-2">
              {activeAsset.type === "video" && (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-500/20">
                  <svg
                    aria-hidden="true"
                    className="text-blue-500"
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="16"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
              )}
              {activeAsset.type === "audio" && (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-green-500/20">
                  <svg
                    aria-hidden="true"
                    className="text-green-500"
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="16"
                  >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
              {activeAsset.type === "image" && (
                <div className="flex h-8 w-8 items-center justify-center rounded bg-purple-500/20">
                  <svg
                    aria-hidden="true"
                    className="text-purple-500"
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="16"
                  >
                    <rect height="18" rx="2" ry="2" width="18" x="3" y="3" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
              <span className="max-w-32 truncate font-medium text-sm">
                {activeAsset.name}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
