import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseMediaRoots } from "../src/config.js";
import { MediaAccess } from "../src/services/media-access.js";

describe("MediaAccess", () => {
  let temporary: string;
  let root: string;
  let outside: string;
  let access: MediaAccess;

  beforeEach(async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-path-test-"));
    root = path.join(temporary, "media");
    outside = path.join(temporary, "outside");
    await Promise.all([mkdir(root), mkdir(outside)]);
    const roots = await parseMediaRoots(`Test=${root}`);
    access = new MediaAccess(() => roots);
  });

  afterEach(async () => { await rm(temporary, { recursive: true, force: true }); });

  it("accepts existing files contained in a configured root", async () => {
    const file = path.join(root, "photo.jpg");
    await writeFile(file, "image");
    const resolved = await access.resolveExisting(file, "file");
    expect(resolved.canonicalPath).toBe(file);
  });

  it("rejects traversal and absolute paths outside configured roots", async () => {
    await expect(access.resolveExisting(path.join(root, "..", "outside", "secret.jpg"), "file")).rejects.toMatchObject({ code: "PATH_OUTSIDE_ROOTS" });
    await expect(access.resolveExisting("/etc/passwd", "file")).rejects.toMatchObject({ code: "PATH_OUTSIDE_ROOTS" });
    await expect(access.resolveExisting("../relative.jpg", "file")).rejects.toMatchObject({ code: "INVALID_PATH" });
  });

  it("rejects a symlink that resolves outside its root", async () => {
    const secret = path.join(outside, "secret.jpg");
    const link = path.join(root, "linked.jpg");
    await writeFile(secret, "secret");
    await symlink(secret, link);
    await expect(access.resolveExisting(link, "file")).rejects.toMatchObject({ code: "SYMLINK_ESCAPE" });
  });

  it("keeps missing references valid for metadata without treating them as files", async () => {
    const missing = path.join(root, "later", "photo.jpg");
    expect(access.validateReference(missing).requestedPath).toBe(missing);
    expect(await access.exists(missing, "file")).toBe(false);
  });
});
