import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const folderMetadata = sqliteTable(
  "folder_metadata",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    path: text("path").notNull(),
    alias: text("alias"),
    favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("folder_metadata_path_unique").on(table.path),
    index("folder_metadata_favorite_idx").on(table.favorite),
    index("folder_metadata_hidden_idx").on(table.hidden),
  ],
);

export const lists = sqliteTable("lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const listItems = sqliteTable(
  "list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    mediaPath: text("media_path").notNull(),
    mediaKind: text("media_kind", { enum: ["image", "video"] }).notNull(),
    status: text("status", { enum: ["selected", "maybe"] }).notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("list_items_list_media_unique").on(table.listId, table.mediaPath),
    index("list_items_list_status_idx").on(table.listId, table.status),
    check("list_items_kind_check", sql`${table.mediaKind} IN ('image', 'video')`),
    check("list_items_status_check", sql`${table.status} IN ('selected', 'maybe')`),
  ],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
