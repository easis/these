# *these*

*these* is a self-hosted, directory-first gallery for browsing image and video folders, making selections, and downloading those selections. It is intended for existing NAS and homelab directory structures where the filesystem must remain the source of truth.

*these* does not import, move, rename, or reorganize media. The mounted directories can be read-only. Its writable data consists of SQLite metadata and a disposable thumbnail cache.

## Screenshots

Screenshots will be added after the first packaged release. The current application includes the home page, three-pane browser, media viewer, list review, folder metadata manager, and light/dark themes described below.

## How it works

The server enumerates a folder only when it is opened. It does not scan the full library during startup. Directory children and media pages are loaded on demand; thumbnails are generated independently with `sharp` or `ffmpeg` and cached under `/data/cache`.

SQLite stores only *these*-owned metadata:

- lists and each item's Selected or Maybe state
- folder aliases, favorite state, and hidden state
- the active list

Original media remains in the mounted filesystem and is never stored as a SQLite blob.

## Quick start

Copy the example Compose file and adjust its host paths:

```sh
cp docker-compose.example.yml docker-compose.yml
docker compose up --build
```

Open `http://localhost:4000`.

Open **Settings**, then add each mounted container path as a media root, for example `Photos` at `/media/photos`.

The example builds locally. For a published image, replace `build: .` and `image: these:local` with the eventual registry image name.

## Mounting media

Each volume maps a host directory to a container directory:

```yaml
services:
  these:
    volumes:
      - ./data:/data
      - /volume1/photos:/media/photos:ro
      - /volume1/downloads:/media/downloads:ro
```

In the first mapping, `/volume1/photos` is the real host directory and `/media/photos` is its stable name inside *these*. After the container starts, add `/media/photos` from **Settings → Media roots** and give it the label you want displayed in the application.

Use absolute container paths. Commas separate roots; paths containing commas are not supported in the current configuration format.

*these* persists media and folder references using container paths. If a later Compose change moves `/media/downloads/lisbon` to `/media/downloads/app/lisbon`, the old metadata remains and appears as Missing. Open **Folder metadata**, edit the path to the new mounted location, and save. The alias, favorite, and hidden state remain on the same internal record.

## Lists

A list is one selection with two review states:

- **Selected** is the default download group.
- **Maybe** holds files for a second pass.

Only one state can exist for a given media path within a list. Assigning Selected to a Maybe item changes its state instead of duplicating it. The same media can independently belong to several lists.

The active list is visible in the browser toolbar. The three-pane browser also shows list counts on the right. Opening a list separates Selected and Maybe into review galleries, where an item can change state or be removed without a dialog.

**Download Selected** streams a ZIP directly from mounted files. Maybe and all-item downloads are available from the list screen/API. When two items have the same basename, *these* keeps the first and names later entries `name (2).ext`, `name (3).ext`, and so on. Missing media is omitted without deleting its list reference.

## Folder metadata

Folder metadata does not change a directory on disk.

- An **alias** replaces the visible folder name; the real path remains available as a tooltip and in the metadata manager.
- A **favorite** adds a quick reference above the folder tree.
- A **hidden** folder and its complete subtree disappear from normal navigation.

Use the inline folder actions in Browse to create metadata. The central **Folder metadata** page can search paths and aliases, filter flags or Missing records, edit aliases and paths, restore hidden folders, and remove metadata. A repaired path must exist as a directory inside a configured media root. *these* rejects traversal, external absolute paths, and symlink escapes.

## Keyboard shortcuts

Shortcuts apply to a focused thumbnail or the open viewer.

| Key | Action |
| --- | --- |
| `Enter` or `Space` | Open the focused thumbnail |
| `←` / `→` | Previous / next media in the viewer |
| `1` | Mark Selected in the current list context |
| `2` | Mark Maybe in the current list context |
| `0` | Remove from the current list context |
| `I` | Show or hide technical details for the open media |
| `Esc` | Close the viewer or cancel inline alias editing |

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `/data` | SQLite database and thumbnail cache location |
| `HOST` | `0.0.0.0` | HTTP bind address |
| `PORT` | `4000` | HTTP port |
| `LOG_LEVEL` | `info` | Fastify log level; use `silent` for tests |

There is no authentication in this version. Do not expose the service directly to the public internet. Put it behind access control if it is reachable outside a trusted network.

## Persistent data

`/data/these.db` stores metadata. SQLite also creates `these.db-wal` and `these.db-shm` while running in WAL mode. `/data/cache` contains thumbnails and can be deleted while *these* is stopped; it will be rebuilt on demand.

Back up the SQLite files if lists and folder metadata matter. Original media is not part of a *these* backup.

## Supported media

Images: JPEG, PNG, BMP, WebP, AVIF, GIF (first frame), TIFF, HEIC, and HEIF where the installed `sharp` build can decode them.

Videos: MP4, MOV, M4V, WebM, MKV, and AVI. Browser playback still depends on the browser's codecs. `ffmpeg` generates video thumbnails.

Files with other extensions do not appear in the gallery.

## Development

Requirements: Node.js 22 or newer, pnpm 10, and `ffmpeg`/`ffprobe` on `PATH` for video thumbnails.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

The server loads environment files from the repository root with `dotenv-flow`. In development the precedence is `.env`, `.env.local`, `.env.development`, then `.env.development.local`; variables already exported by the shell take priority over every file. Relative values such as `DATA_DIR=./data` are resolved from the repository root.

Vite runs at `http://localhost:5173` and proxies `/api` to Fastify on port 4000. Add local absolute paths from the Settings screen after startup.

Run the verification suite:

```sh
pnpm check
```

Tests cover filesystem containment, symlink escape, folder metadata repair, list state constraints, missing media, filtered pagination, request races, byte ranges, and ZIP filename collisions.

## Building

Build the frontend and server locally:

```sh
pnpm build
```

Start the production build (like `next start`):

```sh
pnpm start
```

`pnpm start` expects the application to be built already and runs the server with
`NODE_ENV=production`.

Build the single-service container:

```sh
docker build -t these:local .
```

The runtime image contains Node.js, the Fastify server, the compiled React application, production dependencies, and `ffmpeg`.

## Limitations

- Single-user and no built-in authentication.
- No global or fuzzy search; filename filtering applies to the open folder and folder metadata search applies to recorded folders.
- Folder moves are repaired manually rather than detected automatically.
- Directory symlinks are not shown in the tree. Direct symlink paths are validated and cannot escape a root.
- The list review screen loads up to 1,000 items in this version. Downloads allow a larger bounded set and stream their contents.
- Mobile is usable for basic access but the primary layout is desktop and tablet oriented.

## License

MIT. See [LICENSE](LICENSE).
