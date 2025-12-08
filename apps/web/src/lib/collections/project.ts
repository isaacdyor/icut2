import type { InferRouterOutputs } from "@orpc/server";
import type { AppRouter } from "@t-example/api/routers/index";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { client, queryClient } from "@/utils/orpc";

type RouterOutputs = InferRouterOutputs<AppRouter>;

export type Project = RouterOutputs["project"]["getAll"][number];

export const projectCollectionOptions = queryCollectionOptions({
  queryKey: ["projects"],
  queryFn: async () => {
    const projects = await client.project.getAll();
    return projects;
  },
  queryClient,
  getKey: (item: Project) => item.id,
  onInsert: async ({ transaction }) => {
    await Promise.all(
      transaction.mutations.map(async (mutation) => {
        const result = await client.project.create({
          name: mutation.modified.name,
        });
        return result;
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
