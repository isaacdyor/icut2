import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { Asset, Clip, Project } from "@/lib/types";
import { client, queryClient } from "@/utils/orpc";

// Type for projects list (without nested includes)
type ProjectListItem = {
  id: string;
  name: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

// Projects list collection options (for dashboard - all user's projects)
export const projectCollectionOptions = queryCollectionOptions({
  queryKey: ["projects"],
  queryFn: () => client.project.getAll(),
  queryClient,
  getKey: (item: ProjectListItem) => item.id,
  onInsert: async ({ transaction }) => {
    await Promise.all(
      transaction.mutations.map(async (mutation) => {
        await client.project.create({
          name: mutation.modified.name,
        });
      })
    );
  },
  onUpdate: async ({ transaction }) => {
    await Promise.all(
      transaction.mutations.map(async (mutation) => {
        await client.project.update({
          id: mutation.modified.id,
          name: mutation.modified.name,
        });
      })
    );
  },
  onDelete: async ({ transaction }) => {
    await Promise.all(
      transaction.mutations.map(async (mutation) => {
        await client.project.delete({
          id: mutation.original.id,
        });
      })
    );
  },
});

// Query key for single project data
export const getProjectQueryKey = (projectId: string) =>
  ["project", projectId] as const;

// Single project collection (contains assets and tracks with clips)
function createProjectCollectionOptions(projectId: string) {
  return queryCollectionOptions({
    queryKey: getProjectQueryKey(projectId),
    queryFn: async () => {
      const project = await client.project.getById({ id: projectId });
      return [project];
    },
    queryClient,
    getKey: (item: Project) => item.id,
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await client.project.update({
            id: mutation.modified.id,
            name: mutation.modified.name,
          });
        })
      );
    },
  });
}

// Mutation helpers for nested entities with optimistic updates
export function createAssetMutations(
  collection: ReturnType<typeof createCollection<Project>>,
  currentProject: Project
) {
  return {
    insert: async (asset: Omit<Asset, "id" | "createdAt">) => {
      const optimisticId = crypto.randomUUID();
      const optimisticAsset: Asset = {
        ...asset,
        id: optimisticId,
        createdAt: new Date(),
      };
      // Optimistically update the collection
      collection.update(currentProject.id, (draft) => {
        draft.assets.push(optimisticAsset);
      });
      // Persist to server
      const created = await client.asset.create(asset);
      // Update with real server data (replace optimistic with real)
      collection.update(currentProject.id, (draft) => {
        const idx = draft.assets.findIndex((a) => a.id === optimisticId);
        if (idx !== -1) {
          draft.assets[idx] = created;
        }
      });
    },
    delete: async (assetId: string) => {
      // Optimistically update the collection
      collection.update(currentProject.id, (draft) => {
        draft.assets = draft.assets.filter((a) => a.id !== assetId);
      });
      // Persist to server
      await client.asset.delete({ id: assetId });
    },
  };
}

export function createClipMutations(
  collection: ReturnType<typeof createCollection<Project>>,
  currentProject: Project
) {
  return {
    insert: async (clip: Omit<Clip, "id" | "createdAt">) => {
      const optimisticId = crypto.randomUUID();
      const optimisticClip: Clip = {
        ...clip,
        id: optimisticId,
        createdAt: new Date(),
      };
      // Optimistically update the collection
      collection.update(currentProject.id, (draft) => {
        const track = draft.tracks.find((t) => t.id === clip.trackId);
        if (track) {
          track.clips.push(optimisticClip);
        }
      });
      // Persist to server
      const created = await client.clip.create(clip);
      // Update with real server data (replace optimistic with real)
      collection.update(currentProject.id, (draft) => {
        const track = draft.tracks.find((t) => t.id === clip.trackId);
        if (track) {
          const idx = track.clips.findIndex((c) => c.id === optimisticId);
          if (idx !== -1) {
            track.clips[idx] = created;
          }
        }
      });
    },
    update: async (
      clipId: string,
      updates: { startMs?: number; durationMs?: number }
    ) => {
      // Optimistically update the collection (position change only)
      collection.update(currentProject.id, (draft) => {
        for (const track of draft.tracks) {
          const clip = track.clips.find((c) => c.id === clipId);
          if (clip) {
            Object.assign(clip, updates);
            break;
          }
        }
      });
      // Persist to server
      await client.clip.update({ id: clipId, ...updates });
    },
    delete: async (clipId: string) => {
      // Optimistically update the collection
      collection.update(currentProject.id, (draft) => {
        for (const track of draft.tracks) {
          track.clips = track.clips.filter((c) => c.id !== clipId);
        }
      });
      // Persist to server
      await client.clip.delete({ id: clipId });
    },
  };
}

// Collection cache (per project)
const projectCollections = new Map<string, unknown>();

export function getProjectCollection(projectId: string) {
  let collection = projectCollections.get(projectId);
  if (!collection) {
    const options = createProjectCollectionOptions(projectId);
    collection = createCollection(options);
    projectCollections.set(projectId, collection);
  }
  return collection as ReturnType<typeof createCollection<Project>>;
}
