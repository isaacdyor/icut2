import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import type { createAssetMutations } from "@/lib/collections/project";
import { client } from "@/utils/orpc";

type AssetDropzoneProps = {
  projectId: string;
  assetMutations: ReturnType<typeof createAssetMutations>;
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

export function AssetDropzone({
  projectId,
  assetMutations,
}: AssetDropzoneProps) {
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
    <div
      {...getRootProps()}
      className={`flex h-32 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
        isDragActive
          ? "border-primary bg-primary/10"
          : "border-muted-foreground/25 hover:border-primary/50"
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <svg
          aria-hidden="true"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </svg>
        <p className="text-sm">
          {uploading.length > 0
            ? `Uploading ${uploading.length} file(s)...`
            : isDragActive
              ? "Drop files here..."
              : "Drop files here or click to upload"}
        </p>
      </div>
    </div>
  );
}
