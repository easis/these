import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { BrowseResponse, CollectionFolder, FolderCollectionDetail, FolderMetadata, ListItemStatus, MediaEntry, MediaKind, MediaRoot } from "@these/shared";
import { AppError } from "../lib/errors.js";
import { mediaKindForPath, mimeTypeForPath } from "../lib/media.js";
import { MediaAccess } from "../services/media-access.js";
import { MediaMetadataService } from "../services/media-metadata.js";
import { MediaRootService } from "../services/media-roots.js";
import { Repository } from "../services/repository.js";
import { ThumbnailService } from "../services/thumbnails.js";
import { statMediaPage } from "../services/directory-media.js";
import { parseByteRange } from "../services/byte-range.js";

interface ApiDependencies {
  mediaAccess: MediaAccess;
  mediaMetadata: MediaMetadataService;
  mediaRoots: MediaRootService;
  repository: Repository;
  thumbnails: ThumbnailService;
}

export async function registerApi(app: FastifyInstance, dependencies: ApiDependencies) {
  const { mediaAccess, mediaMetadata, mediaRoots, repository, thumbnails } = dependencies;

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/bootstrap", async () => {
    const [roots, lists, activeListId, metadata] = await Promise.all([
      mediaRoots.refresh(),
      repository.getLists(),
      repository.getActiveListId(),
      withFolderStatus(repository, mediaAccess),
    ]);
    return {
      roots,
      lists,
      activeListId,
      favorites: metadata
        .filter((folder) => folder.favorite)
        .map((folder) => ({ ...folder, hidden: isHiddenByMetadata(folder.path, metadata) })),
    };
  });

  app.get("/api/collections", async () => {
    await refreshCollectionFolderStatuses(repository, mediaAccess, mediaRoots);
    return repository.getCollections();
  });

  app.post<{ Body: { name?: string } }>("/api/collections", async (request, reply) => {
    const collection = await repository.createCollection(request.body?.name ?? "");
    return reply.code(201).send(collection);
  });

  app.get<{ Params: { id: string } }>("/api/collections/:id", async (request) => {
    const statuses = await refreshCollectionFolderStatuses(repository, mediaAccess, mediaRoots);
    return collectionDetail(repository, mediaRoots, requireId(request.params.id), statuses);
  });

  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/collections/:id", async (request) =>
    repository.renameCollection(requireId(request.params.id), request.body?.name ?? ""),
  );

  app.delete<{ Params: { id: string } }>("/api/collections/:id", async (request, reply) => {
    await repository.deleteCollection(requireId(request.params.id));
    return reply.code(204).send();
  });

  app.put<{ Params: { id: string }; Body: { path?: string } }>("/api/collections/:id/folders", async (request, reply) => {
    const folderPath = (await mediaAccess.resolveExisting(request.body?.path ?? "", "directory")).requestedPath;
    await repository.addCollectionFolder(requireId(request.params.id), folderPath);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string }; Querystring: { path?: string } }>("/api/collections/:id/folders", async (request, reply) => {
    await repository.removeCollectionFolder(requireId(request.params.id), requireStoredFolderPath(request.query.path));
    return reply.code(204).send();
  });

  app.get<{ Querystring: { path?: string } }>("/api/folder-collections", async (request) => {
    const folderPath = (await mediaAccess.resolveExisting(request.query.path ?? "", "directory")).requestedPath;
    return { collectionIds: await repository.getFolderCollectionIds(folderPath) };
  });

  app.put<{ Body: { path?: string; collectionIds?: number[] } }>("/api/folder-collections", async (request) => {
    const folderPath = (await mediaAccess.resolveExisting(request.body?.path ?? "", "directory")).requestedPath;
    const collectionIds = requireCollectionIds(request.body?.collectionIds);
    repository.setFolderCollections(folderPath, collectionIds);
    return { collectionIds };
  });

  app.get<{ Querystring: { path?: string; offset?: string; limit?: string; activeListId?: string; showHidden?: string; filter?: string; kinds?: string } }>("/api/browse", async (request) => {
    const requestedPath = request.query.path ?? mediaRoots.getConfiguredRoots().find((root) => root.available)?.path;
    if (!requestedPath) throw new AppError("No available media roots are configured.", 503, "NO_MEDIA_ROOTS");
    const showHidden = request.query.showHidden === "true";
    const metadata = await repository.getFolderMetadata();
    if (!showHidden && isHiddenByMetadata(requestedPath, metadata)) {
      throw new AppError("This folder is hidden. Enable hidden folders to open it.", 404, "FOLDER_HIDDEN");
    }
    const resolved = await mediaAccess.resolveExisting(requestedPath, "directory");
    const entries = await readdir(resolved.canonicalPath!, { withFileTypes: true });
    const metadataByPath = new Map(metadata.map((record) => [record.path, record]));
    const publicRoot = mediaRoots.getPublicRoots().find((root) => root.id === resolved.root.id)!;
    const currentMetadata = metadataByPath.get(resolved.requestedPath);
    const currentName = resolved.requestedPath === publicRoot.path ? publicRoot.label : path.basename(resolved.requestedPath);
    const currentFolder = {
      path: resolved.requestedPath,
      name: currentName,
      displayName: currentMetadata?.alias ?? (resolved.requestedPath === publicRoot.path ? publicRoot.label : currentName),
      hidden: currentMetadata?.hidden ?? false,
      favorite: currentMetadata?.favorite ?? false,
    };
    const searchFilter = request.query.filter?.trim().toLowerCase() ?? "";
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const folderPath = path.join(resolved.requestedPath, entry.name);
        const folderMetadata = metadataByPath.get(folderPath);
        return {
          path: folderPath,
          name: entry.name,
          displayName: folderMetadata?.alias ?? entry.name,
          hidden: folderMetadata?.hidden ?? false,
          favorite: folderMetadata?.favorite ?? false,
        };
      })
      .filter((folder) => showHidden || !folder.hidden)
      .filter((folder) => !searchFilter || folder.name.toLowerCase().includes(searchFilter) || folder.displayName.toLowerCase().includes(searchFilter))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: false }));

    const requestedKinds = parseMediaKinds(request.query.kinds);
    const mediaNames = entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const kind = mediaKindForPath(entry.name);
        return kind !== null && requestedKinds.has(kind);
      })
      .map((entry) => entry.name)
      .filter((name) => !searchFilter || name.toLowerCase().includes(searchFilter))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const offset = clampInteger(request.query.offset, 0, 1_000_000, 0);
    const limit = clampInteger(request.query.limit, 1, 250, 120);
    const pageNames = mediaNames.slice(offset, offset + limit);
    const activeListId = nullableInteger(request.query.activeListId);
    const availableFiles = await statMediaPage(resolved.canonicalPath!, resolved.requestedPath, pageNames);
    const pagePaths = availableFiles.map((file) => file.requestedPath);
    const statuses = await repository.getStatuses(activeListId, pagePaths);
    const media = availableFiles.map(({ name, requestedPath: mediaPath, stats: fileStat }): MediaEntry => ({
      path: mediaPath,
      name,
      kind: mediaKindForPath(name)!,
      size: fileStat.size,
      modifiedAt: fileStat.mtime.toISOString(),
      status: statuses.get(mediaPath) ?? null,
    }));
    const response: BrowseResponse = {
      path: resolved.requestedPath,
      root: publicRoot,
      currentFolder,
      folders,
      media,
      totalMedia: mediaNames.length,
      offset,
      limit,
      hasMore: offset + limit < mediaNames.length,
    };
    return response;
  });

  app.get<{ Querystring: { path: string; size?: string } }>("/api/thumbnail", async (request, reply) => {
    const kind = requireMediaKind(request.query.path);
    const resolved = await mediaAccess.resolveExisting(request.query.path, "file");
    const size = clampInteger(request.query.size, 96, 1024, 384);
    const thumbnail = await thumbnails.get(resolved.canonicalPath!, kind, size);
    return reply.header("Cache-Control", "public, max-age=31536000, immutable").type("image/jpeg").send(createReadStream(thumbnail));
  });

  app.get<{ Querystring: { path: string } }>("/api/media", async (request, reply) => {
    requireMediaKind(request.query.path);
    const resolved = await mediaAccess.resolveExisting(request.query.path, "file");
    const fileStats = await stat(resolved.canonicalPath!);
    const rangeHeader = request.headers.range;
    reply.header("Accept-Ranges", "bytes").header("Cache-Control", "private, max-age=3600").type(mimeTypeForPath(resolved.requestedPath));
    if (!rangeHeader) {
      return reply.header("Content-Length", String(fileStats.size)).send(createReadStream(resolved.canonicalPath!));
    }
    const range = parseByteRange(rangeHeader, fileStats.size);
    if (!range) {
      return reply.code(416).header("Content-Range", `bytes */${fileStats.size}`).send();
    }
    return reply
      .code(206)
      .header("Content-Range", `bytes ${range.start}-${range.end}/${fileStats.size}`)
      .header("Content-Length", String(range.end - range.start + 1))
      .send(createReadStream(resolved.canonicalPath!, { start: range.start, end: range.end }));
  });

  app.get<{ Querystring: { path: string } }>("/api/media-metadata", async (request, reply) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.raw.once("aborted", abort);
    reply.raw.once("close", abort);
    try {
      const kind = requireMediaKind(request.query.path);
      const resolved = await mediaAccess.resolveExisting(request.query.path, "file");
      return await mediaMetadata.inspect({
        canonicalPath: resolved.canonicalPath!,
        requestedPath: resolved.requestedPath,
        rootPath: resolved.root.path,
        rootLabel: resolved.root.label,
        kind,
        signal: controller.signal,
      });
    } finally {
      request.raw.removeListener("aborted", abort);
      reply.raw.removeListener("close", abort);
    }
  });

  app.get("/api/lists", async () => repository.getLists());

  app.post<{ Body: { name?: string } }>("/api/lists", async (request, reply) => {
    const list = await repository.createList(request.body?.name ?? "");
    return reply.code(201).send(list);
  });

  app.patch<{ Params: { id: string }; Body: { name?: string } }>("/api/lists/:id", async (request) =>
    repository.renameList(requireId(request.params.id), request.body?.name ?? ""),
  );

  app.delete<{ Params: { id: string } }>("/api/lists/:id", async (request, reply) => {
    await repository.deleteList(requireId(request.params.id));
    return reply.code(204).send();
  });

  app.put<{ Params: { id: string }; Body: { path?: string; kind?: MediaKind; status?: ListItemStatus } }>("/api/lists/:id/items", async (request) => {
    const mediaPath = request.body?.path ?? "";
    const kind = requireMediaKind(mediaPath);
    if (request.body?.kind && request.body.kind !== kind) throw new AppError("Media kind does not match the file extension.");
    const status = requireStatus(request.body?.status);
    await mediaAccess.resolveExisting(mediaPath, "file");
    return repository.setListItem(requireId(request.params.id), mediaPath, kind, status);
  });

  app.delete<{ Params: { id: string }; Querystring: { path?: string } }>("/api/lists/:id/items", async (request, reply) => {
    const mediaPath = request.query.path ?? "";
    if (!mediaPath) throw new AppError("A media path is required.");
    await repository.removeListItem(requireId(request.params.id), mediaPath);
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { status?: string; limit?: string; offset?: string } }>("/api/lists/:id/items", async (request) => {
    const status = request.query.status ? requireStatus(request.query.status) : undefined;
    const rows = await repository.getListItems(
      requireId(request.params.id),
      status,
      clampInteger(request.query.limit, 1, 1000, 500),
      clampInteger(request.query.offset, 0, 1_000_000, 0),
    );
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      listId: row.listId,
      path: row.mediaPath,
      name: path.basename(row.mediaPath),
      kind: row.mediaKind,
      status: row.status,
      missing: !(await mediaAccess.exists(row.mediaPath, "file")),
      size: 0,
      modifiedAt: row.updatedAt,
    })));
  });

  app.put<{ Body: { activeListId?: number | null } }>("/api/settings/active-list", async (request) => {
    const activeListId = request.body?.activeListId ?? null;
    if (activeListId !== null && !Number.isInteger(activeListId)) throw new AppError("Active list id must be an integer or null.");
    await repository.setActiveListId(activeListId);
    return { activeListId };
  });

  app.post<{ Body: { label?: string; path?: string } }>("/api/settings/media-roots", async (request, reply) =>
    reply.code(201).send(await mediaRoots.createRoot(request.body ?? {})),
  );

  app.patch<{ Params: { id: string }; Body: { label?: string; path?: string } }>("/api/settings/media-roots/:id", async (request) =>
    mediaRoots.updateRoot(request.params.id, request.body ?? {}),
  );

  app.delete<{ Params: { id: string } }>("/api/settings/media-roots/:id", async (request, reply) => {
    await mediaRoots.deleteRoot(request.params.id);
    return reply.code(204).send();
  });

  app.get("/api/folder-metadata", async () => withFolderStatus(repository, mediaAccess));

  app.post<{ Body: { path?: string; alias?: string | null; favorite?: boolean; hidden?: boolean } }>("/api/folder-metadata", async (request, reply) => {
    const folderPath = request.body?.path ?? "";
    await mediaAccess.resolveExisting(folderPath, "directory");
    const record = await repository.createFolderMetadata({ ...request.body, path: path.resolve(folderPath) });
    return reply.code(201).send({ ...record, status: "ok" });
  });

  app.patch<{ Params: { id: string }; Body: { path?: string; alias?: string | null; favorite?: boolean; hidden?: boolean } }>("/api/folder-metadata/:id", async (request) => {
    if (request.body?.path !== undefined) await mediaAccess.resolveExisting(request.body.path, "directory");
    const record = await repository.updateFolderMetadata(requireId(request.params.id), {
      ...request.body,
      ...(request.body?.path === undefined ? {} : { path: path.resolve(request.body.path) }),
    });
    return { ...record, status: (await mediaAccess.exists(record.path, "directory")) ? "ok" : "missing" };
  });

  app.delete<{ Params: { id: string } }>("/api/folder-metadata/:id", async (request, reply) => {
    await repository.deleteFolderMetadata(requireId(request.params.id));
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string }; Querystring: { status?: string } }>("/api/lists/:id/download", async (request, reply) => {
    const id = requireId(request.params.id);
    const requestedStatus = request.query.status ?? "selected";
    const status = requestedStatus === "all" ? undefined : requireStatus(requestedStatus);
    const [availableLists, items] = await Promise.all([repository.getLists(), repository.getListItems(id, status, 100_000, 0)]);
    const list = availableLists.find((candidate) => candidate.id === id);
    if (!list) throw new AppError("List not found.", 404, "LIST_NOT_FOUND");
    const files: Array<{ path: string; name: string }> = [];
    const usedNames = new Set<string>();
    for (const item of items) {
      try {
        const resolved = await mediaAccess.resolveExisting(item.mediaPath, "file");
        files.push({ path: resolved.canonicalPath!, name: uniqueArchiveName(path.basename(item.mediaPath), usedNames) });
      } catch {
        // Missing items remain in the list but are omitted from downloads.
      }
    }
    const archive = archiver("zip", { zlib: { level: 1 } });
    archive.on("warning", (error) => app.log.warn(error));
    archive.on("error", (error) => archive.destroy(error));
    for (const file of files) archive.append(createReadStream(file.path), { name: file.name });
    void archive.finalize();
    const filename = `${safeFilename(list.name)}-${requestedStatus}.zip`;
    return reply
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("X-These-Included", String(files.length))
      .header("X-These-Skipped", String(items.length - files.length))
      .type("application/zip")
      .send(archive);
  });
}

async function withFolderStatus(repository: Repository, mediaAccess: MediaAccess): Promise<FolderMetadata[]> {
  const records = await repository.getFolderMetadata();
  return Promise.all(records.map(async (record) => ({
    ...record,
    status: (await mediaAccess.exists(record.path, "directory")) ? "ok" as const : "missing" as const,
  })));
}

type CollectionFolderStatus = CollectionFolder["status"] | "invalid";

async function refreshCollectionFolderStatuses(repository: Repository, mediaAccess: MediaAccess, mediaRoots: MediaRootService) {
  await mediaRoots.refresh();
  const paths = await repository.getAllCollectionFolderPaths();
  const checked = await Promise.all(paths.map(async (folderPath) => [folderPath, await getCollectionFolderStatus(mediaAccess, folderPath)] as const));
  const invalidPaths = checked.filter(([, status]) => status === "invalid").map(([folderPath]) => folderPath);
  await repository.deleteCollectionFoldersByPath(invalidPaths);
  return new Map(checked.filter((entry): entry is readonly [string, CollectionFolder["status"]] => entry[1] !== "invalid"));
}

async function getCollectionFolderStatus(mediaAccess: MediaAccess, folderPath: string): Promise<CollectionFolderStatus> {
  let reference;
  try {
    reference = mediaAccess.validateReference(folderPath);
  } catch {
    return "invalid";
  }
  if (!reference.root.canonicalPath) return "root-unavailable";
  try {
    await mediaAccess.resolveExisting(folderPath, "directory");
    return "ready";
  } catch (error) {
    if (error instanceof AppError && ["PATH_MISSING", "PATH_TYPE_MISMATCH", "SYMLINK_ESCAPE"].includes(error.code)) return "invalid";
    return "unavailable";
  }
}

async function collectionDetail(repository: Repository, mediaRoots: MediaRootService, id: number, statuses: Map<string, CollectionFolder["status"]>): Promise<FolderCollectionDetail> {
  const [collection, folderPaths, metadata] = await Promise.all([
    repository.getCollection(id),
    repository.getCollectionFolderPaths(id),
    repository.getFolderMetadata(),
  ]);
  const metadataByPath = new Map(metadata.map((record) => [record.path, record]));
  const roots = mediaRoots.getPublicRoots();
  const folders = folderPaths.map((folderPath): CollectionFolder => {
    const folderMetadata = metadataByPath.get(folderPath);
    const root = findContainingRoot(folderPath, roots);
    const name = root?.path === folderPath ? root.label : path.basename(folderPath);
    return {
      path: folderPath,
      name,
      displayName: folderMetadata?.alias ?? name,
      hidden: isHiddenByMetadata(folderPath, metadata),
      favorite: folderMetadata?.favorite ?? false,
      status: statuses.get(folderPath) ?? "root-unavailable",
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, undefined, { numeric: false }) || left.path.localeCompare(right.path));
  return { ...collection, folders };
}

function findContainingRoot(folderPath: string, roots: MediaRoot[]): MediaRoot | undefined {
  return roots
    .filter((root) => folderPath === root.path || folderPath.startsWith(`${root.path}${path.sep}`))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

function isHiddenByMetadata(folderPath: string, metadata: Awaited<ReturnType<Repository["getFolderMetadata"]>>) {
  const normalized = path.resolve(folderPath);
  return metadata.some((record) => record.hidden && (normalized === record.path || normalized.startsWith(`${record.path}${path.sep}`)));
}

function requireMediaKind(mediaPath: string): MediaKind {
  const kind = mediaKindForPath(mediaPath);
  if (!kind) throw new AppError("Unsupported media type.", 415, "UNSUPPORTED_MEDIA");
  return kind;
}

function requireStatus(value: unknown): ListItemStatus {
  if (value !== "selected" && value !== "maybe") throw new AppError("Status must be selected or maybe.");
  return value;
}

function requireId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("A valid numeric id is required.");
  return id;
}

function nullableInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requireStoredFolderPath(value: string | undefined): string {
  if (!value || value.includes("\0") || !path.isAbsolute(value)) throw new AppError("A valid absolute folder path is required.");
  return path.resolve(value);
}

function requireCollectionIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new AppError("Collection ids must be an array of positive integers.");
  }
  return [...new Set(value as number[])];
}

function parseMediaKinds(value: string | undefined): Set<MediaKind> {
  if (value === undefined) return new Set(["image", "video"]);
  const values = value.split(",").map((kind) => kind.trim()).filter(Boolean);
  if (!values.length || values.some((kind) => kind !== "image" && kind !== "video")) {
    throw new AppError("Kinds must contain image, video, or both.", 400, "INVALID_MEDIA_KINDS");
  }
  return new Set(values as MediaKind[]);
}

function clampInteger(value: string | undefined, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function uniqueArchiveName(filename: string, used: Set<string>) {
  if (!used.has(filename.toLowerCase())) {
    used.add(filename.toLowerCase());
    return filename;
  }
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let suffix = 2;
  while (used.has(`${stem} (${suffix})${extension}`.toLowerCase())) suffix += 1;
  const unique = `${stem} (${suffix})${extension}`;
  used.add(unique.toLowerCase());
  return unique;
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "these-list";
}
