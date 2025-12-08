import { ORPCError } from "@orpc/server";
import { db } from "@t-example/db";
import {
  assetSelectSchema,
  project,
  projectInsertSchema,
  projectSelectSchema,
  projectUpdateSchema,
} from "@t-example/db/schema/app";
import { and, eq } from "drizzle-orm";
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
    .output(projectSelectSchema.extend({ assets: z.array(assetSelectSchema) }))
    .handler(async ({ input, context }) => {
      const proj = await db.query.project.findFirst({
        where: and(
          eq(project.id, input.id),
          eq(project.userId, context.session.user.id)
        ),
        with: {
          assets: true,
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
    .output(projectSelectSchema)
    .handler(async ({ input, context }) => {
      const [created] = await db
        .insert(project)
        .values({
          ...input,
          userId: context.session.user.id,
        })
        .returning();

      if (!created) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      return created;
    }),

  update: protectedProcedure
    .route({ method: "PUT", path: "/projects/{id}" })
    .input(z.object({ ...projectUpdateSchema.shape, id: z.string() }))
    .output(projectSelectSchema)
    .handler(async ({ input, context }) => {
      const [updatedProj] = await db
        .update(project)
        .set(input)
        .where(
          and(
            eq(project.id, input.id),
            eq(project.userId, context.session.user.id)
          )
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
    .handler(async ({ input, context }) => {
      const result = await db
        .delete(project)
        .where(
          and(
            eq(project.id, input.id),
            eq(project.userId, context.session.user.id)
          )
        )
        .returning();

      if (result.length === 0) {
        throw new ORPCError("NOT_FOUND");
      }
    }),
};
