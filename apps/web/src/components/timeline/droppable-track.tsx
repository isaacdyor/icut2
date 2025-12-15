import { useDroppable } from "@dnd-kit/core";

type Track = {
  id: string;
  name: string;
  type: "video" | "audio";
  order: number;
};

type DroppableTrackProps = {
  track: Track;
};

export function DroppableTrack({ track }: DroppableTrackProps) {
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
      <div className="relative flex-1 px-2">
        {isOver ? (
          <div className="flex h-10 items-center justify-center rounded border-2 border-current border-dashed text-muted-foreground">
            <span className="text-xs">Drop here</span>
          </div>
        ) : (
          <div className="flex h-full items-center text-muted-foreground/50 text-xs">
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
