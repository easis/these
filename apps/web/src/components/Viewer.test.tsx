import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import type { MediaEntry, MediaMetadataResponse } from "@these/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Viewer } from "./Viewer";

const mocks = vi.hoisted(() => ({ api: vi.fn(), startMediaDownload: vi.fn() }));

vi.mock("../lib/api", async () => ({
  ...await vi.importActual<typeof import("../lib/api")>("../lib/api"),
  api: mocks.api,
}));

vi.mock("../lib/downloads", () => ({ startMediaDownload: mocks.startMediaDownload }));

describe("Viewer technical details", () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.startMediaDownload.mockReset();
  });

  it("downloads the original before the details control", () => {
    render(<ViewerHarness />);
    const viewer = screen.getByRole("dialog", { name: "first.jpg" });
    const download = within(viewer).getByRole("button", { name: "Download first.jpg" });
    const details = within(viewer).getByRole("button", { name: "Show details" });
    expect(download.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(download);
    expect(mocks.startMediaDownload).toHaveBeenCalledWith("/media/album/first.jpg", "first.jpg");
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("toggles the active classification without a separate Remove button", () => {
    render(<ClassificationHarness />);
    const selected = screen.getByRole("button", { name: "Remove selected status" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Remove$/ })).not.toBeInTheDocument();

    fireEvent.click(selected);
    expect(screen.getByRole("button", { name: "Mark selected" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByRole("button", { name: "Remove selected status" })).toBeInTheDocument();
  });

  it("offers Discarded with shortcut 3 and image-only zoom controls", () => {
    render(<ClassificationHarness />);
    expect(screen.getByRole("button", { name: "Mark discarded" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Image zoom controls" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByRole("button", { name: "Remove discarded status" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps native video controls without image zoom controls", () => {
    render(<Viewer items={[{ ...mediaEntry("clip.mp4"), kind: "video" }]} index={0} classificationContext={null} classificationEnabled onIndex={() => undefined} onClose={() => undefined} onStatus={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "clip.mp4" }).querySelector("video")).toHaveAttribute("controls");
    expect(screen.queryByRole("group", { name: "Image zoom controls" })).not.toBeInTheDocument();
  });

  it("loads details only after opening the panel and renders the curated metadata", async () => {
    mocks.api.mockResolvedValue(imageMetadata("first.jpg", { location: { latitude: 40.416775, longitude: -3.70379, altitudeMeters: 667 } }));
    render(<ViewerHarness />);

    expect(mocks.api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));

    const panel = await screen.findByRole("complementary", { name: "Technical details" });
    expect(within(panel).getByText("JPEG · 6,000 × 4,000 · 23.4 MiB")).toBeInTheDocument();
    expect(within(panel).getByText("Library / album/first.jpg")).toBeInTheDocument();
    expect(within(panel).getByText("Fujifilm · X-T5")).toBeInTheDocument();
    const location = within(panel).getByRole("link", { name: /40\.416775, -3\.70379/ });
    expect(location).toHaveAttribute("href", "https://www.google.com/maps/search/?api=1&query=40.416775%2C-3.70379");
    expect(location).toHaveAttribute("target", "_blank");
    expect(mocks.api).toHaveBeenCalledWith("/api/media-metadata?path=%2Fmedia%2Falbum%2Ffirst.jpg", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("keeps the panel open while navigating, ignores stale responses and caches visited files", async () => {
    const first = deferred<MediaMetadataResponse>();
    const calls: Array<{ path: string; signal?: AbortSignal }> = [];
    mocks.api.mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url !== "string") {
        calls.push({ path: "<missing>" });
        return Promise.resolve(imageMetadata("missing.jpg"));
      }
      const mediaPath = new URLSearchParams(url.split("?")[1] ?? "").get("path") ?? url;
      calls.push({ path: mediaPath, signal: init?.signal as AbortSignal | undefined });
      return mediaPath.endsWith("first.jpg") ? first.promise : Promise.resolve(imageMetadata("second.jpg"));
    });
    render(<ViewerHarness />);
    fireEvent.keyDown(window, { key: "i" });
    expect(await screen.findByText("Reading file metadata…")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Library / album/second.jpg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide details" })).toBeInTheDocument();
    expect(calls[0]?.signal?.aborted).toBe(true);

    first.resolve(imageMetadata("first.jpg"));
    await waitFor(() => expect(screen.queryByText("Library / album/first.jpg")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Library / album/first.jpg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Library / album/second.jpg")).toBeInTheDocument();
    expect(calls.filter((call) => call.path.endsWith("second.jpg"))).toHaveLength(1);
    expect(calls.filter((call) => call.path === "<missing>")).toHaveLength(0);
  });

  it("clears the previous item's details while the next item is loading", async () => {
    const second = deferred<MediaMetadataResponse>();
    mocks.api.mockImplementation((url?: string) => url?.includes("second.jpg") ? second.promise : Promise.resolve(imageMetadata("first.jpg")));
    render(<ViewerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(await screen.findByText("Library / album/first.jpg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Library / album/first.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("Reading file metadata…")).toBeInTheDocument();
    second.resolve(imageMetadata("second.jpg"));
    expect(await screen.findByText("Library / album/second.jpg")).toBeInTheDocument();
    expect(mocks.api.mock.calls.every(([url]) => typeof url === "string")).toBe(true);
  });

  it("offers a retry after a metadata request fails", async () => {
    mocks.api.mockRejectedValueOnce(new Error("Metadata service unavailable")).mockResolvedValueOnce(imageMetadata("first.jpg"));
    render(<ViewerHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));

    expect(await screen.findByText("Metadata service unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Library / album/first.jpg")).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});

function ViewerHarness() {
  const [index, setIndex] = useState(0);
  return <Viewer
    items={items}
    index={index}
    classificationContext="List: Review"
    classificationEnabled
    onIndex={setIndex}
    onClose={() => undefined}
    onStatus={() => undefined}
  />;
}

function ClassificationHarness() {
  const [status, setStatus] = useState<MediaEntry["status"]>("selected");
  return <Viewer
    items={[{ ...mediaEntry("first.jpg"), status }]}
    index={0}
    classificationContext="List: Review"
    classificationEnabled
    onIndex={() => undefined}
    onClose={() => undefined}
    onStatus={setStatus}
  />;
}

const items: MediaEntry[] = [mediaEntry("first.jpg"), mediaEntry("second.jpg")];

function mediaEntry(name: string): MediaEntry {
  return { path: `/media/album/${name}`, name, kind: "image", size: 0, modifiedAt: "", status: null };
}

function imageMetadata(name: string, overrides: Partial<MediaMetadataResponse> = {}): MediaMetadataResponse {
  return {
    kind: "image",
    file: {
      name,
      rootLabel: "Library",
      relativePath: `album/${name}`,
      extension: "jpg",
      mimeType: "image/jpeg",
      size: 24_543_232,
      modifiedAt: "2026-08-25T16:42:10.000Z",
    },
    image: { format: "jpeg", width: 6000, height: 4000, megapixels: 24, colorSpace: "srgb", channels: 3, depth: "uchar", hasAlpha: false, hasProfile: true, isProgressive: false },
    capture: { cameraMake: "Fujifilm", cameraModel: "X-T5", exposureTimeSeconds: 0.004, aperture: 2.8, iso: 400 },
    warnings: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
