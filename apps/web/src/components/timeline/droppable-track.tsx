import { useDroppable } from "@dnd-kit/core";
import type { Asset, Track } from "@/lib/types";
import { msToPx, TRACK_LABEL_WIDTH } from "./constants";
import { DraggableClip } from "./draggable-clip";

type PreviewData = {
  positionMs: number;
  durationMs: number;
  isClip: boolean;
};

type DroppableTrackProps = {
  track: Track;
  assets: Asset[];
  onClipDelete: (clipId: string) => void;
  preview: PreviewData | null;
  draggedClipId: string | null;
  zoom: number;
  timelineWidth: number;
};

export function DroppableTrack({
  track,
  assets,
  onClipDelete,
  preview,
  draggedClipId,
  zoom,
  timelineWidth,
}: DroppableTrackProps) {
  const { clips } = track;
  const { isOver, setNodeRef } = useDroppable({
    id: track.id,
  });

  const isVideo = track.type === "video";
  const bgColor = isVideo ? "bg-blue-500/10" : "bg-green-500/10";
  const borderColor = isVideo ? "border-blue-500/30" : "border-green-500/30";
  const accentColor = isVideo ? "bg-blue-500" : "bg-green-500";
  const hoverBorder = isVideo
    ? "hover:border-blue-500/50"
    : "hover:border-green-500/50";
  const activeBorder = isVideo ? "border-blue-500" : "border-green-500";
  const overClasses = isOver
    ? `${activeBorder} border-2 bg-opacity-30`
    : borderColor;
  const clipBgColor = isVideo ? "bg-blue-500/40" : "bg-green-500/40";
  const clipBorderColor = isVideo
    ? "border-blue-500/60"
    : "border-green-500/60";

  function getAssetName(assetId: string): string {
    const asset = assets.find((a) => a.id === assetId);
    return asset?.name ?? "Unknown";
  }

  return (
    <div
      className={`relative flex h-14 items-center border-b transition-colors ${bgColor} ${overClasses} ${hoverBorder}`}
      ref={setNodeRef}
    >
      {/* Track label - fixed width */}
      <div
        className={`flex h-full shrink-0 items-center justify-center border-r ${borderColor}`}
        style={{ width: `${TRACK_LABEL_WIDTH}px` }}
      >
        <div className="flex flex-col items-center gap-0.5">
          <div className={`h-2 w-2 rounded-full ${accentColor}`} />
          <span className="font-medium font-mono text-[10px]">
            {track.name}
          </span>
        </div>
      </div>

      {/* Track content area - scrollable */}
      <div
        className="relative h-full overflow-visible"
        style={{ width: `${timelineWidth}px` }}
      >
        <div className="absolute inset-y-1 right-0 left-0">
          {/* Existing clips - draggable */}
          {clips.map((clip) => {
            const isDragging = clip.id === draggedClipId;
            return (
              <DraggableClip
                accentColor={accentColor}
                assetName={getAssetName(clip.assetId)}
                clip={clip}
                clipBgColor={clipBgColor}
                clipBorderColor={clipBorderColor}
                isDragging={isDragging}
                key={clip.id}
                onDelete={() => onClipDelete(clip.id)}
                zoom={zoom}
              />
            );
          })}

          {/* Drop preview - shows exactly where the clip will land */}
          {preview ? (
            <ClipPreview
              durationMs={preview.durationMs}
              isClip={preview.isClip}
              isVideo={isVideo}
              positionMs={preview.positionMs}
              zoom={zoom}
            />
          ) : null}
        </div>

        {/* Empty state */}
        {clips.length === 0 && !preview ? (
          <div className="flex h-full items-center px-2 text-muted-foreground/40 text-xs">
            {isOver ? "Drop here" : "Drag assets here"}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClipPreview({
  positionMs,
  durationMs,
  isVideo,
  isClip,
  zoom,
}: {
  positionMs: number;
  durationMs: number;
  isVideo: boolean;
  isClip: boolean;
  zoom: number;
}) {
  const leftPx = msToPx(positionMs, zoom);
  const widthPx = msToPx(durationMs, zoom);
  const previewColor = isVideo ? "border-blue-400" : "border-green-400";
  const previewBg = isVideo ? "bg-blue-400/30" : "bg-green-400/30";

  return (
    <div
      className={`pointer-events-none absolute top-0 bottom-0 rounded border-2 border-dashed ${previewColor} ${previewBg} ${isClip ? "opacity-80" : "opacity-60"}`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        minWidth: "40px",
      }}
    />
  );
}
