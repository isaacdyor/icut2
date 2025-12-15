import { ORPCError } from "@orpc/server";
import { db } from "@t-example/db";
import { and, eq } from "@t-example/db/drizzle";
import {
  assetSelectSchema,
  project,
  projectInsertSchema,
  projectSelectSchema,
  projectUpdateSchema,
  track,
  trackSelectSchema,
} from "@t-example/db/schema/app";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const projectRouter = {
  getAll: protectedProcedure
    .route({ method: "GET", path: "/projects" })
    .output(z.array(projectSelectSchema))
    .handler(async ({ context }) =>
      db.query.project.findMany({
        where: eq(project.userId, context.session.user.id),
      })
    ),

  getById: protectedProcedure
    .route({ method: "GET", path: "/projects/{id}" })
    .input(z.object({ id: z.string() }))
    .output(
      projectSelectSchema.extend({
        assets: z.array(assetSelectSchema),
        tracks: z.array(trackSelectSchema),
      })
    )
    .handler(async ({ input, context }) => {
      const proj = await db.query.project.findFirst({
        where: and(
          eq(project.id, input.id),
          eq(project.userId, context.session.user.id)
        ),
        with: {
          assets: true,
          tracks: {
            orderBy: (t, { asc }) => [asc(t.order)],
          },
        },
      });

      if (!proj) {
        throw new ORPCError("NOT_FOUND");
      }

      return proj;
    }),

  create: protectedProcedure
    .route({ method: "POST", path: "/projects" })
    .input(projectInsertSchema)
    .output(projectSelectSchema.extend({ tracks: z.array(trackSelectSchema) }))
    .handler(async ({ input, context }) =>
      db.transaction(async (tx) => {
        const [created] = await tx
          .insert(project)
          .values({
            name: input.name,
            userId: context.session.user.id,
          })
          .returning();

        if (!created) {
          throw new ORPCError("INTERNAL_SERVER_ERROR");
        }

        const defaultTracks = [
          { projectId: created.id, name: "V1", type: "video" as const, order: 0 },
          { projectId: created.id, name: "A1", type: "audio" as const, order: 1 },
          { projectId: created.id, name: "A2", type: "audio" as const, order: 2 },
        ];

        const tracks = await tx.insert(track).values(defaultTracks).returning();

        return { ...created, tracks };
      })
    ),

  update: protectedProcedure
    .route({ method: "PATCH", path: "/projects/{id}" })
    .input(projectUpdateSchema.extend({ id: z.string() }))
    .output(projectSelectSchema)
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;

      const [updatedProj] = await db
        .update(project)
        .set(updates)
        .where(
          and(eq(project.id, id), eq(project.userId, context.session.user.id))
        )
        .returning();

      if (!updatedProj) {
        throw new ORPCError("NOT_FOUND");
      }

      return updatedProj;
    }),

  delete: protectedProcedure
    .route({ method: "DELETE", path: "/projects/{id}" })
    .input(z.object({ id: z.string() }))
    .output(projectSelectSchema)
    .handler(async ({ input, context }) => {
      const [deleted] = await db
        .delete(project)
        .where(
          and(
            eq(project.id, input.id),
            eq(project.userId, context.session.user.id)
          )
        )
        .returning();

      if (!deleted) {
        throw new ORPCError("NOT_FOUND");
      }

      return deleted;
    }),
};
