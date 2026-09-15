# Working in These

## Project context

These is a directory-first media gallery, deployed as one Node.js service:

- `apps/server`: Fastify API, SQLite metadata, filesystem access and thumbnails.
- `apps/web`: React/Vite interface, served by Fastify in production.
- `packages/shared`: TypeScript contracts shared by the server and web app.

Use [README.md](README.md) for development setup and configuration, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) when changing persistence or media
access. Read the sections relevant to the task; verify implementation details
against the current code.

## Product constraints

- Keep original media untouched. Store application metadata in SQLite and generated
  thumbnails in the cache; browsing must work with read-only media mounts.
- Keep browsing lazy: load directories, media pages, thumbnails and technical
  metadata on demand. Do not introduce a startup scan or import requirement.
- Preserve both lexical containment and `realpath` containment checks in media
  access so paths and symlinks cannot escape configured roots.

## Validation and completion

Run commands from the repository root with pnpm. Choose checks for the affected
behavior:

- Server tests: `pnpm --filter @these/server test`.
- Web tests: `pnpm --filter @these/web test`.
- A focused test file: append its package-relative path to the relevant test command.
- Shared contracts or TypeScript changes: `pnpm typecheck`.
- Full verification when warranted by the scope: `pnpm check` (typecheck, tests and build).
- Documentation-only changes: verify referenced paths and commands, then run
  `git diff --check`; a full suite is unnecessary.

Complete the requested behavior, run the relevant checks, and fix failures caused
by the change before handing back the result. Report what changed, validation
results and any remaining limitations.

Local tests using disposable fixtures can be run and rerun within the requested
work. Keep test media and databases isolated from real data. Starting the app
against an existing data directory can apply migrations; it is not equivalent to
running an isolated test. Ask before destructive operations on real data unless
the user has explicitly authorized that operation.
