import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@t-example/api/routers/index";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { client, queryClient } from "@/utils/orpc";

type RouterOutputs = InferRouterOutputs<AppRouter>;

export type Asset = RouterOutputs["asset"]["getById"];

function createAssetCollectionOptions(projectId: string) {
  return queryCollectionOptions({
    queryKey: ["assets", projectId],
    queryFn: async () => {
      const project = await client.project.getById({ id: projectId });
      return project.assets;
    },
    queryClient,
    getKey: (item: Asset) => item.id,
    onInsert: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await client.asset.create({
            projectId: mutation.modified.projectId,
            name: mutation.modified.name,
            url: mutation.modified.url,
            type: mutation.modified.type,
          });
        })
      );
    },
    onUpdate: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await client.asset.update({
            id: mutation.modified.id,
            name: mutation.modified.name,
          });
        })
      );
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await client.asset.delete({
            id: mutation.original.id,
          });
        })
      );
    },
  });
}

const assetCollections = new Map<string, unknown>();

export function getAssetCollection(projectId: string) {
  let collection = assetCollections.get(projectId);
  if (!collection) {
    const options = createAssetCollectionOptions(projectId);
    collection = createCollection(options);
    assetCollections.set(projectId, collection);
  }
  return collection as ReturnType<typeof createCollection<Asset>>;
}
