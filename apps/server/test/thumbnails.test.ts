import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ThumbnailService } from "../src/services/thumbnails.js";

describe("ThumbnailService", () => {
  let temporary: string | undefined;

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  });

  it("generates a JPEG thumbnail for a BMP without passing it through sharp", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-bmp-thumbnail-test-"));
    const source = path.join(temporary, "sample.BMP");
    await writeFile(source, createBmp());

    const thumbnail = await new ThumbnailService(path.join(temporary, "cache")).get(source, "image", 32);
    const output = await readFile(thumbnail);

    expect(output.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });
});

function createBmp(): Buffer {
  const bitmap = Buffer.alloc(70);
  bitmap.write("BM", 0, "ascii");
  bitmap.writeUInt32LE(bitmap.length, 2);
  bitmap.writeUInt32LE(54, 10);
  bitmap.writeUInt32LE(40, 14);
  bitmap.writeInt32LE(2, 18);
  bitmap.writeInt32LE(2, 22);
  bitmap.writeUInt16LE(1, 26);
  bitmap.writeUInt16LE(24, 28);
  bitmap.writeUInt32LE(16, 34);
  Buffer.from([
    0, 0, 255, 0, 255, 0, 0, 0,
    255, 0, 0, 255, 255, 255, 0, 0,
  ]).copy(bitmap, 54);
  return bitmap;
}
