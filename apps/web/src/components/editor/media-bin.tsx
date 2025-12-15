import { useDraggable } from "@dnd-kit/core";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { createAssetMutations } from "@/lib/collections/project";
import type { Asset } from "@/lib/types";
import { client } from "@/utils/orpc";

type MediaBinProps = {
  projectId: string;
  assets: Asset[];
  assetMutations: ReturnType<typeof createAssetMutations>;
  onAssetDelete: (assetId: string) => void;
};

function getAssetType(mimeType: string): "video" | "audio" | "image" {
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return "image";
}

export function MediaBin({
  projectId,
  assets,
  assetMutations,
  onAssetDelete,
}: MediaBinProps) {
  const [uploading, setUploading] = useState<string[]>([]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
        const tempId = crypto.randomUUID();
        setUploading((prev) => [...prev, tempId]);

        try {
          const { uploadUrl, publicUrl } = await client.asset.getUploadUrl({
            key: `${projectId}/${file.name}`,
            contentType: file.type,
          });

          await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          });

          const assetType = getAssetType(file.type);

          await assetMutations.insert({
            projectId,
            name: file.name,
            url: publicUrl,
            type: assetType,
          });
        } catch (error) {
          console.error("Upload failed:", error);
        } finally {
          setUploading((prev) => prev.filter((id) => id !== tempId));
        }
      }
    },
    [projectId, assetMutations]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/*": [],
      "audio/*": [],
      "image/*": [],
    },
  });

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card">
      <div className="shrink-0 border-b px-3 py-2">
        <h3 className="font-medium text-muted-foreground text-sm">Media</h3>
      </div>

      {/* Entire area is the dropzone */}
      <div
        {...getRootProps()}
        className={`relative flex-1 cursor-pointer transition-colors ${
          isDragActive ? "bg-primary/10" : ""
        }`}
      >
        <input {...getInputProps()} />

        {/* Drag overlay indicator */}
        {isDragActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-primary border-dashed bg-primary/5">
            <div className="flex flex-col items-center gap-2 text-primary">
              <UploadIcon className="h-8 w-8" />
              <p className="font-medium text-sm">Drop files here</p>
            </div>
          </div>
        ) : null}

        {/* Uploading indicator */}
        {uploading.length > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-background/70">
            <p className="text-sm">Uploading {uploading.length} file(s)...</p>
          </div>
        ) : null}

        {/* Thumbnail grid overlay */}
        <div className="absolute inset-0 overflow-auto p-2">
          {assets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <UploadIcon />
              <p className="text-center text-sm">
                Drop media files here or click to upload
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {assets.map((asset) => (
                <DraggableAssetThumbnail
                  asset={asset}
                  key={asset.id}
                  onDelete={() => onAssetDelete(asset.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableAssetThumbnail({
  asset,
  onDelete,
}: {
  asset: Asset;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: asset.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group relative aspect-video cursor-grab overflow-hidden rounded border bg-muted transition-all hover:border-primary ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      {/* Thumbnail */}
      {asset.type === "image" ? (
        <img
          alt={asset.name}
          className="h-full w-full object-cover"
          height={90}
          src={asset.url}
          width={160}
        />
      ) : null}

      {asset.type === "video" ? (
        <div className="flex h-full w-full items-center justify-center bg-blue-500/20">
          <div className="rounded-full bg-blue-500/30 p-3">
            <PlayIcon className="h-6 w-6 text-blue-400" />
          </div>
        </div>
      ) : null}

      {asset.type === "audio" ? (
        <div className="flex h-full w-full items-center justify-center bg-green-500/20">
          <div className="rounded-full bg-green-500/30 p-3">
            <AudioIcon className="h-6 w-6 text-green-400" />
          </div>
        </div>
      ) : null}

      {/* Name overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="truncate font-medium text-white text-xs">{asset.name}</p>
      </div>

      {/* Delete button */}
      <button
        aria-label="Delete asset"
        className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
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

function UploadIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function PlayIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function AudioIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
