import { ORPCError } from "@orpc/server";
import { db } from "@t-example/db";
import { and, eq, inArray } from "@t-example/db/drizzle";
import {
  project,
  track,
  trackInsertSchema,
  trackSelectSchema,
  trackUpdateSchema,
} from "@t-example/db/schema/app";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const trackRouter = {
  getByProjectId: protectedProcedure
    .route({ method: "GET", path: "/projects/{projectId}/tracks" })
    .input(z.object({ projectId: z.string() }))
    .output(z.array(trackSelectSchema))
    .handler(async ({ input, context }) => {
      const proj = await db.query.project.findFirst({
        where: and(
          eq(project.id, input.projectId),
          eq(project.userId, context.session.user.id)
        ),
      });

      if (!proj) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      return db.query.track.findMany({
        where: eq(track.projectId, input.projectId),
        orderBy: (tracks, { asc }) => [asc(tracks.order)],
      });
    }),

  getById: protectedProcedure
    .route({ method: "GET", path: "/tracks/{id}" })
    .input(z.object({ id: z.string() }))
    .output(trackSelectSchema)
    .handler(async ({ input, context }) => {
      const [result] = await db
        .select({ track })
        .from(track)
        .innerJoin(project, eq(track.projectId, project.id))
        .where(
          and(
            eq(track.id, input.id),
            eq(project.userId, context.session.user.id)
          )
        );

      if (!result) {
        throw new ORPCError("NOT_FOUND");
      }

      return result.track;
    }),

  create: protectedProcedure
    .route({ method: "POST", path: "/tracks" })
    .input(trackInsertSchema)
    .output(trackSelectSchema)
    .handler(async ({ input, context }) => {
      const proj = await db.query.project.findFirst({
        where: and(
          eq(project.id, input.projectId),
          eq(project.userId, context.session.user.id)
        ),
      });

      if (!proj) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      const [created] = await db.insert(track).values(input).returning();

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return created;
    }),

  update: protectedProcedure
    .route({ method: "PATCH", path: "/tracks/{id}" })
    .input(trackUpdateSchema.extend({ id: z.string() }))
    .output(trackSelectSchema)
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;

      const [updated] = await db
        .update(track)
        .set(updates)
        .where(
          and(
            eq(track.id, id),
            inArray(
              track.projectId,
              db
                .select({ id: project.id })
                .from(project)
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
    .route({ method: "DELETE", path: "/tracks/{id}" })
    .input(z.object({ id: z.string() }))
    .output(trackSelectSchema)
    .handler(async ({ input, context }) => {
      const [deleted] = await db
        .delete(track)
        .where(
          and(
            eq(track.id, input.id),
            inArray(
              track.projectId,
              db
                .select({ id: project.id })
                .from(project)
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
