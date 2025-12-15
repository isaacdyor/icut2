import { useDraggable } from "@dnd-kit/core";
import type { Asset } from "@/lib/collections/asset";

type DraggableAssetProps = {
  asset: Asset;
  onDelete: () => void;
};

export function DraggableAsset({ asset, onDelete }: DraggableAssetProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: asset.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group relative flex cursor-grab items-center gap-2 rounded-md border bg-background p-2 transition-all hover:border-primary ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {/* Thumbnail */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
        {asset.type === "image" && (
          <img
            alt={asset.name}
            className="h-full w-full object-cover"
            height={40}
            src={asset.url}
            width={40}
          />
        )}
        {asset.type === "video" && (
          <div className="flex h-full w-full items-center justify-center bg-blue-500/20">
            <svg
              aria-label="Video"
              className="text-blue-500"
              fill="none"
              height="16"
              role="img"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )}
        {asset.type === "audio" && (
          <div className="flex h-full w-full items-center justify-center bg-green-500/20">
            <svg
              aria-label="Audio"
              className="text-green-500"
              fill="none"
              height="16"
              role="img"
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
      </div>

      {/* Name and type */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{asset.name}</p>
        <p className="text-muted-foreground text-xs capitalize">{asset.type}</p>
      </div>

      {/* Delete button */}
      <button
        aria-label="Delete asset"
        className="-top-1 -right-1 absolute flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="10"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="10"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
