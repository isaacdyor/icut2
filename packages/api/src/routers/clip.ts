import { ORPCError } from "@orpc/server";
import { db } from "@t-example/db";
import { and, eq, inArray } from "@t-example/db/drizzle";
import {
  asset,
  clip,
  clipInsertSchema,
  clipSelectSchema,
  clipUpdateSchema,
  project,
  track,
} from "@t-example/db/schema/app";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const clipRouter = {
  getByTrackId: protectedProcedure
    .route({ method: "GET", path: "/tracks/{trackId}/clips" })
    .input(z.object({ trackId: z.string() }))
    .output(z.array(clipSelectSchema))
    .handler(async ({ input, context }) => {
      const [trackResult] = await db
        .select({ track })
        .from(track)
        .innerJoin(project, eq(track.projectId, project.id))
        .where(
          and(
            eq(track.id, input.trackId),
            eq(project.userId, context.session.user.id)
          )
        );

      if (!trackResult) {
        throw new ORPCError("NOT_FOUND", { message: "Track not found" });
      }

      return db.query.clip.findMany({
        where: eq(clip.trackId, input.trackId),
        orderBy: (clips, { asc }) => [asc(clips.startMs)],
      });
    }),

  getById: protectedProcedure
    .route({ method: "GET", path: "/clips/{id}" })
    .input(z.object({ id: z.string() }))
    .output(clipSelectSchema)
    .handler(async ({ input, context }) => {
      const [result] = await db
        .select({ clip })
        .from(clip)
        .innerJoin(track, eq(clip.trackId, track.id))
        .innerJoin(project, eq(track.projectId, project.id))
        .where(
          and(
            eq(clip.id, input.id),
            eq(project.userId, context.session.user.id)
          )
        );

      if (!result) {
        throw new ORPCError("NOT_FOUND");
      }

      return result.clip;
    }),

  create: protectedProcedure
    .route({ method: "POST", path: "/clips" })
    .input(clipInsertSchema)
    .output(clipSelectSchema)
    .handler(async ({ input, context }) => {
      const [trackResult] = await db
        .select({ track })
        .from(track)
        .innerJoin(project, eq(track.projectId, project.id))
        .where(
          and(
            eq(track.id, input.trackId),
            eq(project.userId, context.session.user.id)
          )
        );

      if (!trackResult) {
        throw new ORPCError("NOT_FOUND", { message: "Track not found" });
      }

      const assetResult = await db.query.asset.findFirst({
        where: eq(asset.id, input.assetId),
      });

      if (!assetResult) {
        throw new ORPCError("NOT_FOUND", { message: "Asset not found" });
      }

      const [created] = await db.insert(clip).values(input).returning();

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return created;
    }),

  update: protectedProcedure
    .route({ method: "PATCH", path: "/clips/{id}" })
    .input(clipUpdateSchema.extend({ id: z.string() }))
    .output(clipSelectSchema)
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;

      const [updated] = await db
        .update(clip)
        .set(updates)
        .where(
          and(
            eq(clip.id, id),
            inArray(
              clip.trackId,
              db
                .select({ id: track.id })
                .from(track)
                .innerJoin(project, eq(track.projectId, project.id))
                .where(eq(project.userId, context.session.user.id))
            )
          )
        )
        .returning();

      if (!updated) {
        throw new ORPCError("NOT_FOUND");
      }

      return updated;
    }),

  delete: protectedProcedure
    .route({ method: "DELETE", path: "/clips/{id}" })
    .input(z.object({ id: z.string() }))
    .output(clipSelectSchema)
    .handler(async ({ input, context }) => {
      const [deleted] = await db
        .delete(clip)
        .where(
          and(
            eq(clip.id, input.id),
            inArray(
              clip.trackId,
              db
                .select({ id: track.id })
                .from(track)
                .innerJoin(project, eq(track.projectId, project.id))
                .where(eq(project.userId, context.session.user.id))
            )
          )
        )
        .returning();

      if (!deleted) {
        throw new ORPCError("NOT_FOUND");
      }

      return deleted;
    }),
};
