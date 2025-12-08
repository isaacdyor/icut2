import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Projects - Just a container with a name
export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("project_userId_idx").on(table.userId)],
);

export const projectRelations = relations(project, ({ one, many }) => ({
  user: one(user, {
    fields: [project.userId],
    references: [user.id],
  }),
  assets: many(asset),
  tracks: many(track),
}));

// Assets - Files uploaded to the project
export const asset = pgTable(
  "asset",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(), // S3/R2 URL
    type: text("type", { enum: ["video", "audio", "image"] }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("asset_projectId_idx").on(table.projectId)],
);

export const assetRelations = relations(asset, ({ one, many }) => ({
  project: one(project, {
    fields: [asset.projectId],
    references: [project.id],
  }),
  clips: many(clip),
}));

// Tracks - Horizontal layers in the timeline
export const track = pgTable(
  "track",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    order: integer("order").notNull(), // Vertical stacking
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("track_projectId_idx").on(table.projectId)],
);

export const trackRelations = relations(track, ({ one, many }) => ({
  project: one(project, {
    fields: [track.projectId],
    references: [project.id],
  }),
  clips: many(clip),
}));

// Clips - Asset instances on the timeline
export const clip = pgTable(
  "clip",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => track.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),

    // Where and how long on timeline
    startMs: integer("start_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("clip_trackId_idx").on(table.trackId),
    index("clip_assetId_idx").on(table.assetId),
  ],
);

export const clipRelations = relations(clip, ({ one }) => ({
  track: one(track, {
    fields: [clip.trackId],
    references: [track.id],
  }),
  asset: one(asset, {
    fields: [clip.assetId],
    references: [asset.id],
  }),
}));
