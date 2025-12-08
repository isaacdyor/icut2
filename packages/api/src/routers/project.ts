import { db } from "@t-example/db";
import { project } from "@t-example/db/schema/app";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const projectRouter = {
  getAll: protectedProcedure.handler(async ({ context }) =>
    db.select().from(project).where(eq(project.userId, context.session.user.id))
  ),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [proj] = await db
        .select()
        .from(project)
        .where(eq(project.id, input.id));

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Project not found");
      }

      return proj;
    }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const id = crypto.randomUUID();
      await db.insert(project).values({
        id,
        name: input.name,
        userId: context.session.user.id,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const result = await db
        .select()
        .from(project)
        .where(eq(project.id, input.id));

      const proj = result[0];

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Project not found");
      }

      await db
        .update(project)
        .set({ name: input.name })
        .where(eq(project.id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const result = await db
        .select()
        .from(project)
        .where(eq(project.id, input.id));

      const proj = result[0];

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Project not found");
      }

      await db.delete(project).where(eq(project.id, input.id));
    }),
};
