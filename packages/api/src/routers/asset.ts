import { env } from "cloudflare:workers";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@t-example/db";
import { asset, project } from "@t-example/db/schema/app";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const assetRouter = {
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [assetRecord] = await db
        .select()
        .from(asset)
        .where(eq(asset.id, input.id));

      if (!assetRecord) {
        throw new Error("Asset not found");
      }

      const [proj] = await db
        .select()
        .from(project)
        .where(eq(project.id, assetRecord.projectId));

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Asset not found");
      }

      return assetRecord;
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        url: z.url(),
        type: z.enum(["video", "audio", "image"]),
      })
    )
    .handler(async ({ input, context }) => {
      const [proj] = await db
        .select()
        .from(project)
        .where(eq(project.id, input.projectId));

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Project not found");
      }

      const id = crypto.randomUUID();
      await db.insert(asset).values({
        id,
        projectId: input.projectId,
        name: input.name,
        url: input.url,
        type: input.type,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        url: z.string().url().optional(),
        type: z.enum(["video", "audio", "image"]).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      const [assetRecord] = await db
        .select()
        .from(asset)
        .where(eq(asset.id, input.id));

      if (!assetRecord) {
        throw new Error("Asset not found");
      }

      const [proj] = await db
        .select()
        .from(project)
        .where(eq(project.id, assetRecord.projectId));

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Asset not found");
      }

      const { ...updates } = input;
      await db.update(asset).set(updates).where(eq(asset.id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const [assetRecord] = await db
        .select()
        .from(asset)
        .where(eq(asset.id, input.id));

      if (!assetRecord) {
        throw new Error("Asset not found");
      }

      const [proj] = await db
        .select()
        .from(project)
        .where(eq(project.id, assetRecord.projectId));

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Asset not found");
      }

      await db.delete(asset).where(eq(asset.id, input.id));
    }),

  getUploadUrl: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        filename: z.string().min(1),
        contentType: z.string().min(1),
      })
    )
    .handler(async ({ input, context }) => {
      const [proj] = await db
        .select()
        .from(project)
        .where(eq(project.id, input.projectId));

      if (!proj || proj.userId !== context.session.user.id) {
        throw new Error("Project not found");
      }

      const s3Client = new S3Client({
        region: "auto",
        endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const key = `${input.projectId}/${crypto.randomUUID()}-${input.filename}`;

      const command = new PutObjectCommand({
        Bucket: "assets",
        Key: key,
        ContentType: input.contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      const publicUrl = `https://${env.R2_PUBLIC_URL}/${key}`;

      return { uploadUrl, key, publicUrl };
    }),
};
