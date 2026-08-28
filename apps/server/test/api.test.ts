import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmod, mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { BootstrapResponse, BrowseResponse, FolderCollection, FolderCollectionDetail, FolderMetadata, ListItem, ListItemStatus, MediaMetadataResponse, TheseList } from "@these/shared";
import { buildApp } from "../src/app.js";
import { loadConfig, parseMediaRoots } from "../src/config.js";

describe("These API", () => {
  let temporary: string;
  let root: string;
  let dataDir: string;
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-api-test-"));
    root = path.join(temporary, "media");
    dataDir = path.join(temporary, "data");
    await mkdir(root);
    const roots = await parseMediaRoots(`Library=${root}`);
    const config = await loadConfig({
      roots,
      dataDir,
      logLevel: "silent",
      migrationsDir: path.resolve("drizzle"),
      webDistDir: path.join(temporary, "web-dist"),
    });
    app = await buildApp(config);
  });

  afterEach(async () => {
    await app?.close();
    await rm(temporary, { recursive: true, force: true });
  });

  it("creates and updates folder metadata while retaining its stable id", async () => {
    const firstPath = path.join(root, "result-123");
    const repairedPath = path.join(root, "archive", "result-123");
    await mkdir(firstPath);
    const created = await app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: firstPath, alias: "Dogs", favorite: true } });
    expect(created.statusCode).toBe(201);
    const record = created.json<FolderMetadata>();
    expect(record).toMatchObject({ alias: "Dogs", favorite: true, hidden: false, status: "ok" });

    const partialUpdate = await app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: firstPath, hidden: true } });
    expect(partialUpdate.json<FolderMetadata>()).toMatchObject({ id: record.id, alias: "Dogs", favorite: true, hidden: true });
    const browsed = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(firstPath)}&showHidden=true` });
    expect(browsed.json<BrowseResponse>().currentFolder).toMatchObject({ path: firstPath, name: "result-123", displayName: "Dogs", favorite: true, hidden: true });

    await mkdir(path.dirname(repairedPath), { recursive: true });
    await rename(firstPath, repairedPath);
    const missing = await app!.inject({ method: "GET", url: "/api/folder-metadata" });
    expect(missing.json<FolderMetadata[]>()[0]).toMatchObject({ id: record.id, status: "missing" });

    const repaired = await app!.inject({ method: "PATCH", url: `/api/folder-metadata/${record.id}`, payload: { path: repairedPath, hidden: true } });
    expect(repaired.statusCode).toBe(200);
    expect(repaired.json<FolderMetadata>()).toMatchObject({ id: record.id, path: repairedPath, alias: "Dogs", favorite: true, hidden: true, status: "ok" });
  });

  it("prevents unsafe path repair and hides the whole subtree", async () => {
    const hidden = path.join(root, "hidden");
    const child = path.join(hidden, "child");
    await mkdir(child, { recursive: true });
    const created = await app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: hidden, hidden: true } });
    const record = created.json<FolderMetadata>();
    await app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: child, favorite: true } });

    const bootstrap = (await app!.inject({ method: "GET", url: "/api/bootstrap" })).json<BootstrapResponse>();
    expect(bootstrap.favorites).toContainEqual(expect.objectContaining({ path: child, favorite: true, hidden: true }));
    const directMetadata = (await app!.inject({ method: "GET", url: "/api/folder-metadata" })).json<FolderMetadata[]>();
    expect(directMetadata.find((folder) => folder.path === child)).toMatchObject({ hidden: false });

    const hiddenBrowse = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(child)}` });
    expect(hiddenBrowse.statusCode).toBe(404);
    expect(hiddenBrowse.json()).toMatchObject({ code: "FOLDER_HIDDEN" });
    const unsafe = await app!.inject({ method: "PATCH", url: `/api/folder-metadata/${record.id}`, payload: { path: "/etc" } });
    expect(unsafe.statusCode).toBe(403);
  });

  it("groups the same folder into multiple collections and replaces membership atomically", async () => {
    const dogsPath = path.join(root, "dataset-dogs");
    await mkdir(dogsPath);
    const dogs = await createCollection(app!, "Dogs");
    const training = await createCollection(app!, "Training sets");

    const duplicate = await app!.inject({ method: "POST", url: "/api/collections", payload: { name: " dogs " } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "COLLECTION_NAME_TAKEN" });

    const assigned = await app!.inject({
      method: "PUT",
      url: "/api/folder-collections",
      payload: { path: dogsPath, collectionIds: [dogs.id, training.id, dogs.id] },
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json()).toEqual({ collectionIds: [dogs.id, training.id] });

    const memberships = await app!.inject({ method: "GET", url: `/api/folder-collections?path=${encodeURIComponent(dogsPath)}` });
    expect(new Set(memberships.json<{ collectionIds: number[] }>().collectionIds)).toEqual(new Set([dogs.id, training.id]));
    expect((await app!.inject({ method: "GET", url: "/api/collections" })).json<FolderCollection[]>()).toMatchObject([
      { id: dogs.id, name: "Dogs", folderCount: 1 },
      { id: training.id, name: "Training sets", folderCount: 1 },
    ]);

    await app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: dogsPath, alias: "All dog datasets", favorite: true } });
    const detail = (await app!.inject({ method: "GET", url: `/api/collections/${dogs.id}` })).json<FolderCollectionDetail>();
    expect(detail.folders).toEqual([
      expect.objectContaining({ path: dogsPath, displayName: "All dog datasets", favorite: true, status: "ready" }),
    ]);

    await app!.inject({ method: "PUT", url: "/api/folder-collections", payload: { path: dogsPath, collectionIds: [training.id] } });
    expect((await app!.inject({ method: "GET", url: `/api/collections/${dogs.id}` })).json<FolderCollectionDetail>().folders).toEqual([]);
    expect((await app!.inject({ method: "GET", url: `/api/collections/${training.id}` })).json<FolderCollectionDetail>().folders).toHaveLength(1);
  });

  it("sorts collection names with the same locale-aware comparison used by the client", async () => {
    await createCollection(app!, "Zoo");
    await createCollection(app!, "ábaco");

    const collections = (await app!.inject({ method: "GET", url: "/api/collections" })).json<FolderCollection[]>();
    expect(collections.map((collection) => collection.name)).toEqual(["ábaco", "Zoo"]);
  });

  it("rejects unsafe collection members and removes only definitively missing folders", async () => {
    const folderPath = path.join(root, "temporary-dataset");
    const outside = path.join(temporary, "outside-dataset");
    const unsafeLink = path.join(root, "linked-outside");
    await Promise.all([mkdir(folderPath), mkdir(outside)]);
    await symlink(outside, unsafeLink);
    const collection = await createCollection(app!, "Ephemeral");

    const unsafe = await app!.inject({ method: "PUT", url: "/api/folder-collections", payload: { path: unsafeLink, collectionIds: [collection.id] } });
    expect(unsafe.statusCode).toBe(403);
    expect(unsafe.json()).toMatchObject({ code: "SYMLINK_ESCAPE" });
    const filePath = path.join(root, "not-a-folder.jpg");
    await writeFile(filePath, "image");
    expect((await app!.inject({ method: "PUT", url: "/api/folder-collections", payload: { path: filePath, collectionIds: [collection.id] } })).statusCode).toBe(400);

    await app!.inject({ method: "PUT", url: "/api/folder-collections", payload: { path: folderPath, collectionIds: [collection.id] } });
    const offlineRoot = path.join(temporary, "offline-media");
    await rename(root, offlineRoot);
    const unavailable = (await app!.inject({ method: "GET", url: `/api/collections/${collection.id}` })).json<FolderCollectionDetail>();
    expect(unavailable).toMatchObject({ folderCount: 1, folders: [{ path: folderPath, status: "root-unavailable" }] });

    await rename(offlineRoot, root);
    await rm(folderPath, { recursive: true });
    const cleaned = (await app!.inject({ method: "GET", url: `/api/collections/${collection.id}` })).json<FolderCollectionDetail>();
    expect(cleaned).toMatchObject({ folderCount: 0, folders: [] });
  });

  it("retains collection membership when a folder is temporarily inaccessible", async () => {
    const guardedParent = path.join(root, "guarded");
    const folderPath = path.join(guardedParent, "dataset");
    await mkdir(folderPath, { recursive: true });
    const collection = await createCollection(app!, "Guarded");
    await app!.inject({ method: "PUT", url: "/api/folder-collections", payload: { path: folderPath, collectionIds: [collection.id] } });

    await chmod(guardedParent, 0o000);
    try {
      const unavailable = (await app!.inject({ method: "GET", url: `/api/collections/${collection.id}` })).json<FolderCollectionDetail>();
      expect(unavailable).toMatchObject({ folderCount: 1, folders: [{ path: folderPath, status: "unavailable" }] });
    } finally {
      await chmod(guardedParent, 0o755);
    }

    const restored = (await app!.inject({ method: "GET", url: `/api/collections/${collection.id}` })).json<FolderCollectionDetail>();
    expect(restored).toMatchObject({ folderCount: 1, folders: [{ path: folderPath, status: "ready" }] });
  });

  it("stores one toggle-friendly state per media and list", async () => {
    const mediaPath = path.join(root, "photo.jpg");
    await writeFile(mediaPath, "photo");
    const dogs = await createList(app!, "Dogs");
    const homepage = await createList(app!, "Homepage");

    await setItem(app!, dogs.id, mediaPath, "maybe");
    await setItem(app!, dogs.id, mediaPath, "discarded");
    await setItem(app!, homepage.id, mediaPath, "maybe");

    const dogsItems = (await app!.inject({ method: "GET", url: `/api/lists/${dogs.id}/items` })).json<ListItem[]>();
    const homepageItems = (await app!.inject({ method: "GET", url: `/api/lists/${homepage.id}/items` })).json<ListItem[]>();
    expect(dogsItems).toHaveLength(1);
    expect(dogsItems[0]?.status).toBe("discarded");
    expect(homepageItems).toHaveLength(1);
    expect(homepageItems[0]?.status).toBe("maybe");
    expect((await app!.inject({ method: "GET", url: `/api/lists/${dogs.id}/items?status=discarded` })).json<ListItem[]>()).toHaveLength(1);
    expect((await app!.inject({ method: "GET", url: "/api/lists" })).json<TheseList[]>()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: dogs.id, selectedCount: 0, maybeCount: 0, discardedCount: 1 }),
      expect.objectContaining({ id: homepage.id, selectedCount: 0, maybeCount: 1, discardedCount: 0 }),
    ]));
    expect((await app!.inject({ method: "PUT", url: `/api/lists/${dogs.id}/items`, payload: { path: mediaPath, kind: "image", status: "unknown" } })).statusCode).toBe(400);
  });

  it("filters media names case-insensitively before paginating", async () => {
    await Promise.all([
      writeFile(path.join(root, "Cat-alpha.jpg"), "one"),
      writeFile(path.join(root, "cat-beta.png"), "two"),
      writeFile(path.join(root, "dog.jpg"), "three"),
    ]);

    const first = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=CAT&limit=1&offset=0` });
    expect(first.statusCode).toBe(200);
    expect(first.json<BrowseResponse>()).toMatchObject({
      totalMedia: 2,
      offset: 0,
      limit: 1,
      hasMore: true,
      media: [{ name: "Cat-alpha.jpg" }],
    });

    const second = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=cat&limit=1&offset=1` });
    expect(second.json<BrowseResponse>()).toMatchObject({
      totalMedia: 2,
      offset: 1,
      limit: 1,
      hasMore: false,
      media: [{ name: "cat-beta.png" }],
    });
  });

  it("filters immediate folders by their name or visible alias", async () => {
    const cats = path.join(root, "Cat originals");
    const trips = path.join(root, "summer-archive");
    const hidden = path.join(root, "hidden-cats");
    await Promise.all([mkdir(cats), mkdir(trips), mkdir(hidden)]);
    await Promise.all([
      app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: trips, alias: "Family Trips" } }),
      app!.inject({ method: "POST", url: "/api/folder-metadata", payload: { path: hidden, hidden: true } }),
    ]);

    const byName = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=CAT` });
    expect(byName.statusCode).toBe(200);
    expect(byName.json<BrowseResponse>().folders).toMatchObject([{ name: "Cat originals", displayName: "Cat originals" }]);

    const byAlias = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=family&kinds=video` });
    expect(byAlias.json<BrowseResponse>().folders).toMatchObject([{ name: "summer-archive", displayName: "Family Trips" }]);

    const hiddenByDefault = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=hidden` });
    expect(hiddenByDefault.json<BrowseResponse>().folders).toEqual([]);
    const hiddenShown = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=hidden&showHidden=true` });
    expect(hiddenShown.json<BrowseResponse>().folders).toMatchObject([{ name: "hidden-cats", hidden: true }]);
  });

  it("sorts GUID folder names lexicographically instead of numerically", async () => {
    const names = [
      "2fffffff-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "10000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ];
    await Promise.all(names.map((name) => mkdir(path.join(root, name))));

    const response = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}` });

    expect(response.statusCode).toBe(200);
    expect(response.json<BrowseResponse>().folders.map((folder) => folder.name)).toEqual([
      "10000000-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "2fffffff-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ]);
  });

  it("filters media kinds before filename matching and pagination", async () => {
    await Promise.all([
      writeFile(path.join(root, "cat-photo.jpg"), "one"),
      writeFile(path.join(root, "cat-video.mp4"), "two"),
      writeFile(path.join(root, "dog-video.webm"), "three"),
    ]);

    const videos = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&kinds=video&filter=CAT&limit=1` });
    expect(videos.statusCode).toBe(200);
    expect(videos.json<BrowseResponse>()).toMatchObject({
      totalMedia: 1,
      hasMore: false,
      media: [{ name: "cat-video.mp4", kind: "video" }],
    });

    const defaultKinds = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&filter=CAT` });
    expect(defaultKinds.json<BrowseResponse>()).toMatchObject({ totalMedia: 2 });

    const invalid = await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}&kinds=other` });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "INVALID_MEDIA_KINDS" });
  });

  it("keeps missing list items and removes them explicitly", async () => {
    const mediaPath = path.join(root, "temporary.jpg");
    await writeFile(mediaPath, "photo");
    const list = await createList(app!, "Keepers");
    await setItem(app!, list.id, mediaPath, "selected");
    await unlink(mediaPath);
    const items = (await app!.inject({ method: "GET", url: `/api/lists/${list.id}/items` })).json<ListItem[]>();
    expect(items[0]).toMatchObject({ path: mediaPath, missing: true });
    const removed = await app!.inject({ method: "DELETE", url: `/api/lists/${list.id}/items?path=${encodeURIComponent(mediaPath)}` });
    expect(removed.statusCode).toBe(204);
  });

  it("removes old list references after configured roots are reorganized", async () => {
    const mediaPath = path.join(root, "old-location.jpg");
    await writeFile(mediaPath, "photo");
    const list = await createList(app!, "Archive");
    await setItem(app!, list.id, mediaPath, "selected");

    const replacementRoot = path.join(temporary, "replacement-media");
    await mkdir(replacementRoot);
    const bootstrap = await app!.inject({ method: "GET", url: "/api/bootstrap" });
    const rootId = bootstrap.json<{ roots: Array<{ id: string }> }>().roots[0]!.id;
    const changed = await app!.inject({ method: "PATCH", url: `/api/settings/media-roots/${rootId}`, payload: { label: "Replacement", path: replacementRoot } });
    expect(changed.statusCode).toBe(200);

    await app!.close();
    app = undefined;
    const config = await loadConfig({
      roots: [],
      dataDir,
      logLevel: "silent",
      migrationsDir: path.resolve("drizzle"),
      webDistDir: path.join(temporary, "web-dist"),
    });
    app = await buildApp(config);

    const before = (await app.inject({ method: "GET", url: `/api/lists/${list.id}/items` })).json<ListItem[]>();
    expect(before).toMatchObject([{ path: mediaPath, missing: true }]);
    const removed = await app.inject({ method: "DELETE", url: `/api/lists/${list.id}/items?path=${encodeURIComponent(mediaPath)}` });
    expect(removed.statusCode).toBe(204);
    const repeated = await app.inject({ method: "DELETE", url: `/api/lists/${list.id}/items?path=${encodeURIComponent(mediaPath)}` });
    expect(repeated.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/lists/${list.id}/items` })).json<ListItem[]>()).toEqual([]);
  });

  it("manages media roots in the application and restores them after restart", async () => {
    const initial = (await app!.inject({ method: "GET", url: "/api/bootstrap" })).json<{ roots: Array<{ id: string }> }>().roots[0]!;
    expect((await app!.inject({ method: "DELETE", url: `/api/settings/media-roots/${initial.id}` })).statusCode).toBe(204);
    expect((await app!.inject({ method: "GET", url: "/api/bootstrap" })).json<{ roots: unknown[] }>().roots).toEqual([]);

    const mediaPath = path.join(root, "configured-in-app.jpg");
    await writeFile(mediaPath, "photo");
    const created = await app!.inject({ method: "POST", url: "/api/settings/media-roots", payload: { label: "In app", path: root } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ label: "In app", path: root, available: true });
    expect((await app!.inject({ method: "POST", url: "/api/settings/media-roots", payload: { label: "Duplicate", path: root } })).statusCode).toBe(409);
    expect((await app!.inject({ method: "GET", url: `/api/browse?path=${encodeURIComponent(root)}` })).statusCode).toBe(200);

    await app!.close();
    app = undefined;
    const config = await loadConfig({
      roots: [],
      dataDir,
      logLevel: "silent",
      migrationsDir: path.resolve("drizzle"),
      webDistDir: path.join(temporary, "web-dist"),
    });
    app = await buildApp(config);
    expect((await app.inject({ method: "GET", url: "/api/bootstrap" })).json()).toMatchObject({
      roots: [{ label: "In app", path: root, available: true }],
    });
  });

  it("serves PWA resources with their expected types and preserves the SPA fallback", async () => {
    await app!.close();
    app = undefined;
    const webDistDir = path.join(temporary, "web-dist");
    await mkdir(webDistDir);
    await Promise.all([
      writeFile(path.join(webDistDir, "index.html"), "<!doctype html><title>these</title>"),
      writeFile(path.join(webDistDir, "manifest.webmanifest"), JSON.stringify({ name: "these" })),
      writeFile(path.join(webDistDir, "sw.js"), "self.addEventListener('fetch', () => undefined);"),
    ]);
    const config = await loadConfig({
      roots: await parseMediaRoots(`Library=${root}`),
      dataDir,
      logLevel: "silent",
      migrationsDir: path.resolve("drizzle"),
      webDistDir,
    });
    app = await buildApp(config);

    const manifest = await app.inject({ method: "GET", url: "/manifest.webmanifest" });
    expect(manifest.statusCode).toBe(200);
    expect(manifest.headers["content-type"]).toMatch(/^application\/manifest\+json/);
    expect(manifest.json()).toEqual({ name: "these" });

    const serviceWorker = await app.inject({ method: "GET", url: "/sw.js" });
    expect(serviceWorker.statusCode).toBe(200);
    expect(serviceWorker.headers["content-type"]).toMatch(/^application\/javascript/);
    expect(serviceWorker.headers["cache-control"]).toBe("public, max-age=0");

    const clientRoute = await app.inject({ method: "GET", url: "/lists/42" });
    expect(clientRoute.statusCode).toBe(200);
    expect(clientRoute.headers["content-type"]).toMatch(/^text\/html/);
    expect(clientRoute.body).toContain("<title>these</title>");

    const missingApi = await app.inject({ method: "GET", url: "/api/not-a-route" });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("streams full media and supports one normal or suffix byte range", async () => {
    const mediaPath = path.join(root, "clip.mp4");
    await writeFile(mediaPath, "0123456789");
    const url = `/api/media?path=${encodeURIComponent(mediaPath)}`;

    const full = await app!.inject({ method: "GET", url });
    expect(full.statusCode).toBe(200);
    expect(full.headers["accept-ranges"]).toBe("bytes");
    expect(full.headers["content-length"]).toBe("10");
    expect(full.body).toBe("0123456789");

    const normal = await app!.inject({ method: "GET", url, headers: { range: "bytes=2-5" } });
    expect(normal.statusCode).toBe(206);
    expect(normal.headers["content-range"]).toBe("bytes 2-5/10");
    expect(normal.headers["content-length"]).toBe("4");
    expect(normal.body).toBe("2345");

    const suffix = await app!.inject({ method: "GET", url, headers: { range: "bytes=-3" } });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.headers["content-range"]).toBe("bytes 7-9/10");
    expect(suffix.body).toBe("789");

    for (const range of ["bytes=20-30", "bytes=0-1,4-5"]) {
      const invalid = await app!.inject({ method: "GET", url, headers: { range } });
      expect(invalid.statusCode).toBe(416);
      expect(invalid.headers["content-range"]).toBe("bytes */10");
    }
  });

  it("serves lazy media metadata without exposing absolute paths", async () => {
    const album = path.join(root, "album");
    const mediaPath = path.join(album, "photo.jpg");
    await mkdir(album);
    await writeFile(mediaPath, "not a decodable image");

    const response = await app!.inject({ method: "GET", url: `/api/media-metadata?path=${encodeURIComponent(mediaPath)}` });
    const payload = response.json<MediaMetadataResponse>();
    expect(response.statusCode).toBe(200);
    expect(payload).toMatchObject({
      kind: "image",
      file: { name: "photo.jpg", rootLabel: "Library", relativePath: "album/photo.jpg", size: 21 },
    });
    expect(payload.warnings).toContain("Could not read the image properties.");
    expect(response.body).not.toContain(root);

    const outside = await app!.inject({ method: "GET", url: `/api/media-metadata?path=${encodeURIComponent("/outside/photo.jpg")}` });
    expect(outside.statusCode).toBe(403);
    const missing = await app!.inject({ method: "GET", url: `/api/media-metadata?path=${encodeURIComponent(path.join(root, "missing.jpg"))}` });
    expect(missing.statusCode).toBe(404);
  });

  it("streams ZIP downloads with predictable collision names", async () => {
    const first = path.join(root, "one", "same.jpg");
    const second = path.join(root, "two", "same.jpg");
    await mkdir(path.dirname(first));
    await mkdir(path.dirname(second));
    await writeFile(first, "first");
    await writeFile(second, "second");
    const list = await createList(app!, "Delivery");
    await setItem(app!, list.id, first, "selected");
    await setItem(app!, list.id, second, "selected");
    const response = await app!.inject({ method: "GET", url: `/api/lists/${list.id}/download?status=selected` });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/zip");
    expect(response.headers["x-these-included"]).toBe("2");
    expect(response.rawPayload.includes(Buffer.from("same.jpg"))).toBe(true);
    expect(response.rawPayload.includes(Buffer.from("same (2).jpg"))).toBe(true);
  });

  it("excludes discarded items from all downloads and rejects a discarded download", async () => {
    const selected = path.join(root, "selected.jpg");
    const maybe = path.join(root, "maybe.jpg");
    const discarded = path.join(root, "discarded.jpg");
    await Promise.all([writeFile(selected, "selected"), writeFile(maybe, "maybe"), writeFile(discarded, "discarded")]);
    const list = await createList(app!, "Review");
    await setItem(app!, list.id, selected, "selected");
    await setItem(app!, list.id, maybe, "maybe");
    await setItem(app!, list.id, discarded, "discarded");

    const all = await app!.inject({ method: "GET", url: `/api/lists/${list.id}/download?status=all` });
    expect(all.statusCode).toBe(200);
    expect(all.headers["x-these-included"]).toBe("2");
    expect(all.rawPayload.includes(Buffer.from("selected.jpg"))).toBe(true);
    expect(all.rawPayload.includes(Buffer.from("maybe.jpg"))).toBe(true);
    expect(all.rawPayload.includes(Buffer.from("discarded.jpg"))).toBe(false);

    const rejected = await app!.inject({ method: "GET", url: `/api/lists/${list.id}/download?status=discarded` });
    expect(rejected.statusCode).toBe(400);
  });
});

async function createList(app: FastifyInstance, name: string) {
  return (await app.inject({ method: "POST", url: "/api/lists", payload: { name } })).json<TheseList>();
}

async function createCollection(app: FastifyInstance, name: string) {
  const response = await app.inject({ method: "POST", url: "/api/collections", payload: { name } });
  expect(response.statusCode).toBe(201);
  return response.json<FolderCollection>();
}

async function setItem(app: FastifyInstance, listId: number, mediaPath: string, status: ListItemStatus) {
  const response = await app.inject({ method: "PUT", url: `/api/lists/${listId}/items`, payload: { path: mediaPath, kind: "image", status } });
  expect(response.statusCode).toBe(200);
}
