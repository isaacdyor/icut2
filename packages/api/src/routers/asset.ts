import { env } from "cloudflare:workers";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ORPCError } from "@orpc/server";
import { db } from "@t-example/db";
import { and, eq, inArray, sql } from "@t-example/db/drizzle";
import {
  asset,
  assetInsertSchema,
  assetSelectSchema,
  assetUpdateSchema,
  project,
} from "@t-example/db/schema/app";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const assetRouter = {
  getById: protectedProcedure
    .route({ method: "GET", path: "/assets/{id}" })
    .input(z.object({ id: z.string() }))
    .output(assetSelectSchema)
    .handler(async ({ input, context }) => {
      const [result] = await db
        .select({ asset })
        .from(asset)
        .innerJoin(project, eq(asset.projectId, project.id))
        .where(
          and(
            eq(asset.id, input.id),
            eq(project.userId, context.session.user.id)
          )
        );

      if (!result) {
        throw new ORPCError("NOT_FOUND");
      }

      return result.asset;
    }),

  create: protectedProcedure
    .route({ method: "POST", path: "/assets" })
    .input(assetInsertSchema)
    .output(assetSelectSchema)
    .handler(async ({ input, context }) => {
      const [created] = await db
        .insert(asset)
        .values({
          ...input,
          projectId: sql<string>`(
            SELECT ${project.id} FROM ${project}
            WHERE ${project.id} = ${input.projectId}
            AND ${project.userId} = ${context.session.user.id}
          )`,
        })
        .returning();

      if (!created) {
        throw new ORPCError("NOT_FOUND", { message: "Project not found" });
      }

      return created;
    }),

  update: protectedProcedure
    .route({ method: "PATCH", path: "/assets/{id}" })
    .input(assetUpdateSchema.extend({ id: z.string() }))
    .output(assetSelectSchema)
    .handler(async ({ input, context }) => {
      const { id, ...updates } = input;

      const [updated] = await db
        .update(asset)
        .set(updates)
        .where(
          and(
            eq(asset.id, id),
            inArray(
              asset.projectId,
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
    .route({ method: "DELETE", path: "/assets/{id}" })
    .input(z.object({ id: z.string() }))
    .output(assetSelectSchema)
    .handler(async ({ input, context }) => {
      const [deleted] = await db
        .delete(asset)
        .where(
          and(
            eq(asset.id, input.id),
            inArray(
              asset.projectId,
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

  getUploadUrl: protectedProcedure
    .route({ method: "POST", path: "/assets/upload-url" })
    .input(
      z.object({
        key: z.string().min(1),
        contentType: z.string().min(1),
      })
    )
    .handler(async ({ input }) => {
      const s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const command = new PutObjectCommand({
        Bucket: "assets",
        Key: input.key,
        ContentType: input.contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      const publicUrl = `https://${env.R2_PUBLIC_URL}/${input.key}`;

      return { uploadUrl, key: input.key, publicUrl };
    }),
};
