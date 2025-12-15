import { useDroppable } from "@dnd-kit/core";
import type { Asset, Track } from "@/lib/types";

type DroppableTrackProps = {
  track: Track;
  assets: Asset[];
  onClipDelete?: (clipId: string) => void;
};

const PIXELS_PER_SECOND = 50;

export function DroppableTrack({
  track,
  assets,
  onClipDelete,
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
  const clipBgColor = isVideo ? "bg-blue-500/30" : "bg-green-500/30";
  const clipBorderColor = isVideo
    ? "border-blue-500/50"
    : "border-green-500/50";

  function getAssetName(assetId: string): string {
    const asset = assets.find((a) => a.id === assetId);
    return asset?.name ?? "Unknown";
  }

  return (
    <div
      className={`relative mb-1 flex h-16 items-center rounded border transition-all ${bgColor} ${overClasses} ${hoverBorder}`}
      ref={setNodeRef}
    >
      {/* Track label */}
      <div
        className={`flex h-full w-16 shrink-0 items-center justify-center border-r ${borderColor}`}
      >
        <div className="flex flex-col items-center gap-1">
          <div className={`h-2 w-2 rounded-full ${accentColor}`} />
          <span className="font-medium font-mono text-xs">{track.name}</span>
        </div>
      </div>

      {/* Track content area */}
      <div className="relative h-full flex-1 overflow-hidden">
        {clips.length > 0 ? (
          <div className="absolute inset-y-2 right-0 left-0">
            {clips.map((clip) => {
              const leftPx = (clip.startMs / 1000) * PIXELS_PER_SECOND;
              const widthPx = (clip.durationMs / 1000) * PIXELS_PER_SECOND;

              return (
                <div
                  className={`group absolute top-0 bottom-0 flex items-center rounded border px-2 ${clipBgColor} ${clipBorderColor}`}
                  key={clip.id}
                  style={{
                    left: `${leftPx}px`,
                    width: `${widthPx}px`,
                    minWidth: "60px",
                  }}
                >
                  <span className="truncate font-medium text-xs">
                    {getAssetName(clip.assetId)}
                  </span>
                  {onClipDelete ? (
                    <button
                      aria-label="Delete clip"
                      className="-top-1 -right-1 absolute flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onClipDelete(clip.id)}
                      type="button"
                    >
                      <svg
                        aria-hidden="true"
                        fill="none"
                        height="8"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        width="8"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : isOver ? (
          <div className="flex h-full items-center justify-center rounded border-2 border-current border-dashed text-muted-foreground">
            <span className="text-xs">Drop here</span>
          </div>
        ) : (
          <div className="flex h-full items-center px-2 text-muted-foreground/50 text-xs">
            Drag assets here to add to timeline
          </div>
        )}
      </div>

      {/* Time markers - decorative */}
      <div className="absolute top-0 right-0 flex h-full items-center pr-2 text-muted-foreground/30 text-xs">
        00:00
      </div>
    </div>
  );
}
