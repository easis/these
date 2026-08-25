import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema.js";

export type TheseDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(dataDir: string, migrationsDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "these.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  runMigrations(sqlite, migrationsDir);

  return { db: drizzle(sqlite, { schema }), sqlite };
}

function runMigrations(sqlite: Database.Database, migrationsDir: string) {
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS _these_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const applied = new Set(
    sqlite.prepare("SELECT name FROM _these_migrations").all().map((row) => (row as { name: string }).name),
  );
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const statements = readFileSync(path.join(migrationsDir, file), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    const apply = sqlite.transaction(() => {
      for (const statement of statements) sqlite.exec(statement);
      sqlite.prepare("INSERT INTO _these_migrations (name) VALUES (?)").run(file);
    });
    apply();
  }
}
