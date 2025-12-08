import type { Asset } from "@/lib/collections/asset";

type AssetThumbnailProps = {
  asset: Asset;
  onDelete?: () => void;
};

export function AssetThumbnail({ asset, onDelete }: AssetThumbnailProps) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
      {asset.type === "image" && (
        <img
          alt={asset.name}
          className="h-full w-full object-cover"
          src={asset.url}
        />
      )}
      {asset.type === "video" && (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <video
            className="h-full w-full object-cover"
            muted
            playsInline
            src={asset.url}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-black/50 p-2">
              <svg
                fill="white"
                height="20"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        </div>
      )}
      {asset.type === "audio" && (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <svg
            className="text-muted-foreground"
            fill="none"
            height="32"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="32"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <p className="truncate text-white text-xs">{asset.name}</p>
      </div>

      {onDelete && (
        <button
          className="absolute top-1 right-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
          onClick={onDelete}
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="14"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
