# Architecture

*these* is one deployable Node.js service. The Fastify server exposes the API and serves the compiled React application. There is no media import pipeline and no background library scan.

```text
browser
  ├─ React + Vite + TanStack Virtual
  └─ REST requests
       │
Fastify
  ├─ validated read-only access to SQLite-configured media roots
  ├─ sharp / ffmpeg thumbnail generation → /data/cache
  └─ Drizzle ORM → SQLite metadata in /data/these.db
```

## Filesystem references

Paths stored in SQLite are absolute container paths. An internal numeric id is the stable identity of a folder metadata record, so changing its path does not recreate the record or discard its flags.

Every filesystem read goes through two checks:

1. Resolve and compare the requested path lexically with the configured roots.
2. Resolve the existing path with `realpath` and compare it with the root's own `realpath`.

The second check prevents a symlink below a media root from escaping to another part of the filesystem. Missing references can be retained in SQLite, but they cannot be opened or downloaded. The folder metadata repair endpoint only accepts a new path after it resolves to a directory inside a current root.

## Lazy browsing

The server reads only the directory the user opens. It sorts the supported media filenames, returns a bounded page, and stats only that page. Thumbnails are requested independently and cached using a key derived from path, modification time, file size and requested thumbnail size.

The folder tree requests children only when a node is expanded. The web gallery renders virtual rows and requests more media explicitly.

## Persistence

SQLite contains four small models:

- `folder_metadata`: stable id, editable path, alias, favorite and hidden flags.
- `lists`: named selections.
- `list_items`: a unique `(list_id, media_path)` pair with `selected` or `maybe` status.
- `settings`: server-side single-user state, including the active list id and media-root configuration.

Theme, thumbnail size, collapsed sidebars, last folder and temporary hidden-folder visibility stay in versioned browser local storage. They affect one browser only and do not need database coordination.

Media roots are added, edited and removed from the Settings screen. Their labels and absolute container paths are persisted as JSON in the existing `settings` table, while availability and canonical paths are resolved from the filesystem at server startup or whenever a root is changed.

SQL migrations live in `apps/server/drizzle`. The server applies unapplied files transactionally at startup and records them in `_these_migrations`.

## ZIP collision strategy

Downloads stream existing source files directly into the ZIP. The first basename is preserved. Further case-insensitive collisions receive ` (2)`, ` (3)` and so on before the extension. Missing items are skipped and counted in `X-These-Skipped`.
