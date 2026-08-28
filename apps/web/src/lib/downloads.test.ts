import { afterEach, describe, expect, it, vi } from "vitest";
import { startMediaDownload } from "./downloads";

describe("media downloads", () => {
  afterEach(() => vi.restoreAllMocks());

  it("downloads the original media URL with its visible filename", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    startMediaDownload("/media/album/first image.jpg", "first image.jpg");

    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/api/media?path=%2Fmedia%2Falbum%2Ffirst+image.jpg");
    expect(link.download).toBe("first image.jpg");
    expect(link.isConnected).toBe(false);
  });
});
