import { describe, expect, it } from "vitest";
import { mediaKindForPath, mimeTypeForPath } from "../src/lib/media.js";

describe("media file types", () => {
  it("recognizes BMP files case-insensitively and serves their image MIME type", () => {
    expect(mediaKindForPath("/media/scans/cover.BMP")).toBe("image");
    expect(mimeTypeForPath("/media/scans/cover.BMP")).toBe("image/bmp");
  });
});
