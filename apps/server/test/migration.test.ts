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
