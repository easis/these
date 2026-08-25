import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { extractEmbeddedMetadata, extractVideoMetadata, MediaMetadataService, runFfprobe } from "../src/services/media-metadata.js";

describe("MediaMetadataService", () => {
  let temporary: string | undefined;

  afterEach(async () => {
    if (temporary) await rm(temporary, { recursive: true, force: true });
    temporary = undefined;
  });

  it("returns real image properties and only a root-relative location", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-media-metadata-test-"));
    const folder = path.join(temporary, "albums");
    const source = path.join(folder, "portrait.png");
    await mkdir(folder);
    await sharp({ create: { width: 40, height: 30, channels: 4, background: "#336699" } }).png().toFile(source);

    const result = await new MediaMetadataService().inspect({
      canonicalPath: source,
      requestedPath: source,
      rootPath: temporary,
      rootLabel: "Library",
      kind: "image",
    });

    expect(result).toMatchObject({
      kind: "image",
      file: { name: "portrait.png", rootLabel: "Library", relativePath: "albums/portrait.png", extension: "png", mimeType: "image/png" },
      image: { format: "png", width: 40, height: 30, megapixels: 0.0012, hasAlpha: true },
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain(temporary);
  });

  it("selects readable capture and GPS fields without returning raw tags", () => {
    const result = extractEmbeddedMetadata({
      Make: "Fujifilm",
      Model: "X-T5",
      LensModel: "XF33mmF1.4 R LM WR",
      DateTimeOriginal: "2026:08:25 18:42:10",
      OffsetTimeOriginal: "+02:00",
      ExposureTime: 0.004,
      FNumber: 2.8,
      ISO: 400,
      FocalLength: 33,
      latitude: 40.416775,
      longitude: -3.70379,
      GPSAltitude: 667,
      MakerNote: new Uint8Array([1, 2, 3]),
    });

    expect(result).toEqual({
      capture: {
        capturedAt: "2026:08:25 18:42:10 +02:00",
        cameraMake: "Fujifilm",
        cameraModel: "X-T5",
        lensModel: "XF33mmF1.4 R LM WR",
        exposureTimeSeconds: 0.004,
        aperture: 2.8,
        iso: 400,
        focalLengthMm: 33,
      },
      location: { latitude: 40.416775, longitude: -3.70379, altitudeMeters: 667 },
    });
  });

  it("decodes Windows XP keywords from a real image", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-xp-keywords-test-"));
    const source = path.join(temporary, "keywords.jpg");
    await sharp({ create: { width: 4, height: 3, channels: 3, background: "#336699" } })
      .jpeg()
      .withExif({ IFD0: { XPKeywords: "alpha;beta" } })
      .toFile(source);

    const result = await new MediaMetadataService().inspect({
      canonicalPath: source,
      requestedPath: source,
      rootPath: temporary,
      rootLabel: "Library",
      kind: "image",
    });

    expect(result.capture?.keywords).toEqual(["alpha", "beta"]);
  });

  it("marks successful embedded parsing as partial when exifr reports errors", () => {
    expect(extractEmbeddedMetadata({ Make: "Fujifilm", errors: ["corrupt IPTC segment"] })).toEqual({
      capture: { cameraMake: "Fujifilm" },
      warning: "Some embedded image metadata could not be read.",
    });
  });

  it("maps multiple video and audio streams into the public contract", () => {
    const result = extractVideoMetadata({
      format: { format_name: "mov,mp4", format_long_name: "QuickTime / MOV", duration: "62.5", bit_rate: "8000000", tags: { creation_time: "2026-08-25T16:42:10Z", encoder: "Camera" } },
      streams: [
        { index: 0, codec_type: "video", codec_name: "h264", codec_long_name: "H.264", profile: "High", width: 3840, height: 2160, avg_frame_rate: "30000/1001", pix_fmt: "yuv420p", bit_rate: "7600000", tags: { language: "und" } },
        { index: 1, codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2, channel_layout: "stereo", bit_rate: "192000", tags: { language: "eng" } },
        { index: 2, codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 1, channel_layout: "mono", tags: { language: "spa" } },
      ],
    });

    expect(result).toMatchObject({
      capture: { capturedAt: "2026-08-25T16:42:10Z", software: "Camera" },
      video: {
        container: "mov,mp4",
        durationSeconds: 62.5,
        bitRate: 8_000_000,
        videoStreams: [{ index: 0, codec: "h264", width: 3840, height: 2160, frameRate: 29.97 }],
        audioStreams: [{ index: 1, codec: "aac", sampleRateHz: 48000, channels: 2 }, { index: 2, codec: "aac", channels: 1 }],
      },
    });
  });

  it("keeps file data when probing a video fails", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-video-metadata-test-"));
    const source = path.join(temporary, "broken.mp4");
    await writeFile(source, "not a video");
    const service = new MediaMetadataService(async () => { throw new Error("probe failed"); });

    const result = await service.inspect({ canonicalPath: source, requestedPath: source, rootPath: temporary, rootLabel: "Videos", kind: "video" });

    expect(result.file).toMatchObject({ name: "broken.mp4", relativePath: "broken.mp4", size: 11 });
    expect(result.video).toBeUndefined();
    expect(result.warnings).toEqual(["Could not read the video stream metadata."]);
  });

  it("terminates a probe that exceeds its time budget", async () => {
    await expect(runFfprobe("ignored", {
      timeoutMs: 20,
      spawnProcess: () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 1000)"]),
    })).rejects.toThrow("ffprobe timed out.");
  });

  it("terminates a probe that exceeds its output budget", async () => {
    await expect(runFfprobe("ignored", {
      outputLimitBytes: 16,
      spawnProcess: () => spawn(process.execPath, ["-e", "process.stdout.write(JSON.stringify({data: 'x'.repeat(128)}))"]),
    })).rejects.toThrow("ffprobe returned too much data.");
  });

  it("terminates a probe when its request is aborted", async () => {
    const controller = new AbortController();
    const probe = runFfprobe("ignored", {
      signal: controller.signal,
      spawnProcess: () => spawn(process.execPath, ["-e", "setTimeout(() => {}, 1000)"]),
    });

    controller.abort();

    await expect(probe).rejects.toMatchObject({ name: "AbortError" });
  });

  it("limits concurrent video probes", async () => {
    temporary = await mkdtemp(path.join(os.tmpdir(), "these-video-limit-test-"));
    const source = path.join(temporary, "video.mp4");
    await writeFile(source, "video");
    let active = 0;
    let maximumActive = 0;
    const releases: Array<() => void> = [];
    const probe = vi.fn(() => new Promise((resolve) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      releases.push(() => {
        active -= 1;
        resolve({ streams: [] });
      });
    }));
    const service = new MediaMetadataService(probe);
    const input = { canonicalPath: source, requestedPath: source, rootPath: temporary, rootLabel: "Videos", kind: "video" as const };

    const inspections = [service.inspect(input), service.inspect(input), service.inspect(input)];
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    releases.shift()?.();
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(3));

    expect(maximumActive).toBe(2);
    releases.splice(0).forEach((release) => release());
    await Promise.all(inspections);
  });
});
