import { useDraggable } from "@dnd-kit/core";
import type { Clip } from "@/lib/types";
import { msToPx } from "./constants";

type DraggableClipProps = {
  clip: Clip;
  assetName: string;
  accentColor: string;
  clipBgColor: string;
  clipBorderColor: string;
  onDelete: () => void;
  isDragging: boolean;
  zoom: number;
};

export function DraggableClip({
  clip,
  assetName,
  accentColor,
  clipBgColor,
  clipBorderColor,
  onDelete,
  isDragging,
  zoom,
}: DraggableClipProps) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `clip-${clip.id}`,
    data: { type: "clip", clip },
  });

  const leftPx = msToPx(clip.startMs, zoom);
  const widthPx = msToPx(clip.durationMs, zoom);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group absolute top-0 bottom-0 flex cursor-grab items-center overflow-hidden rounded border ${clipBgColor} ${clipBorderColor} shadow-sm transition-opacity ${
        isDragging ? "opacity-30" : ""
      }`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        minWidth: "40px",
      }}
    >
      {/* Clip visual indicator */}
      <div
        className={`absolute inset-0 opacity-20 ${accentColor}`}
        style={{
          background:
            "repeating-linear-gradient(90deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)",
        }}
      />

      <span className="relative z-10 truncate px-2 font-medium text-xs">
        {assetName}
      </span>

      <button
        aria-label="Delete clip"
        className="-top-1 -right-1 absolute z-20 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
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
    </div>
  );
}
