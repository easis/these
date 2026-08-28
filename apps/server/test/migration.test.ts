import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../src/db/index.js";

describe("folder collection migration", () => {
  let temporary: string | undefined;

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("adds collection tables without changing existing application data", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-collection-migration-"));
    const dataDir = path.join(temporary, "data");
    const migrationsDir = path.join(temporary, "migrations");
    const initialSql = await readFile(path.resolve("drizzle/0000_initial.sql"), "utf8");
    const collectionSql = await readFile(path.resolve("drizzle/0001_folder_collections.sql"), "utf8");
    await mkdir(migrationsDir);
    await writeFile(path.join(migrationsDir, "0000_initial.sql"), initialSql);

    const first = createDatabase(dataDir, migrationsDir);
    first.sqlite.prepare("INSERT INTO lists (name) VALUES (?)").run("Existing review");
    first.sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("active_list_id", "1");
    first.sqlite.close();

    await writeFile(path.join(migrationsDir, "0001_folder_collections.sql"), collectionSql);
    const migrated = createDatabase(dataDir, migrationsDir);
    expect(migrated.sqlite.prepare("SELECT id, name FROM lists").all()).toEqual([{ id: 1, name: "Existing review" }]);
    expect(migrated.sqlite.prepare("SELECT value FROM settings WHERE key = ?").get("active_list_id")).toEqual({ value: "1" });
    expect(migrated.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'folder_collection%' ORDER BY name").all()).toEqual([
      { name: "folder_collection_items" },
      { name: "folder_collections" },
    ]);
    migrated.sqlite.close();
  });
});

describe("discarded list item migration", () => {
  let temporary: string | undefined;

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("preserves list items and rebuilds their constraints, indexes, and cascading foreign key", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-discarded-migration-"));
    const dataDir = path.join(temporary, "data");
    const migrationsDir = path.join(temporary, "migrations");
    const [initialSql, collectionSql, discardedSql] = await Promise.all([
      readFile(path.resolve("drizzle/0000_initial.sql"), "utf8"),
      readFile(path.resolve("drizzle/0001_folder_collections.sql"), "utf8"),
      readFile(path.resolve("drizzle/0002_list_items_discarded.sql"), "utf8"),
    ]);
    await mkdir(migrationsDir);
    await Promise.all([
      writeFile(path.join(migrationsDir, "0000_initial.sql"), initialSql),
      writeFile(path.join(migrationsDir, "0001_folder_collections.sql"), collectionSql),
    ]);

    const first = createDatabase(dataDir, migrationsDir);
    first.sqlite.prepare("INSERT INTO lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(7, "Existing review", "2025-01-02 03:04:05", "2025-02-03 04:05:06");
    first.sqlite.prepare("INSERT INTO list_items (id, list_id, media_path, media_kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(11, 7, "/media/selected.jpg", "image", "selected", "2025-03-04 05:06:07", "2025-04-05 06:07:08");
    first.sqlite.prepare("INSERT INTO list_items (id, list_id, media_path, media_kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(12, 7, "/media/maybe.mp4", "video", "maybe", "2025-05-06 07:08:09", "2025-06-07 08:09:10");
    first.sqlite.close();

    await writeFile(path.join(migrationsDir, "0002_list_items_discarded.sql"), discardedSql);
    const migrated = createDatabase(dataDir, migrationsDir);
    expect(migrated.sqlite.prepare("SELECT * FROM list_items ORDER BY id").all()).toEqual([
      { id: 11, list_id: 7, media_path: "/media/selected.jpg", media_kind: "image", status: "selected", created_at: "2025-03-04 05:06:07", updated_at: "2025-04-05 06:07:08" },
      { id: 12, list_id: 7, media_path: "/media/maybe.mp4", media_kind: "video", status: "maybe", created_at: "2025-05-06 07:08:09", updated_at: "2025-06-07 08:09:10" },
    ]);
    expect(() => migrated.sqlite.prepare("INSERT INTO list_items (list_id, media_path, media_kind, status) VALUES (?, ?, ?, ?)")
      .run(7, "/media/discarded.jpg", "image", "discarded")).not.toThrow();
    expect(() => migrated.sqlite.prepare("INSERT INTO list_items (list_id, media_path, media_kind, status) VALUES (?, ?, ?, ?)")
      .run(7, "/media/unknown.jpg", "image", "unknown")).toThrow(/list_items_status_check/);
    expect(() => migrated.sqlite.prepare("INSERT INTO list_items (list_id, media_path, media_kind, status) VALUES (?, ?, ?, ?)")
      .run(7, "/media/selected.jpg", "image", "maybe")).toThrow(/UNIQUE constraint failed/);
    expect(migrated.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'list_items' ORDER BY name").all()).toEqual([
      { name: "list_items_list_media_unique" },
      { name: "list_items_list_status_idx" },
    ]);
    migrated.sqlite.prepare("DELETE FROM lists WHERE id = ?").run(7);
    expect(migrated.sqlite.prepare("SELECT count(*) AS count FROM list_items").get()).toEqual({ count: 0 });
    migrated.sqlite.close();
  });
});
