import { createHash } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import type { MediaKind } from "@these/shared";
import { AppError } from "../lib/errors.js";

export class ThumbnailService {
  private readonly pending = new Map<string, Promise<string>>();

  constructor(private readonly cacheDir: string) {}

  async get(source: string, kind: MediaKind, size: number): Promise<string> {
    const sourceStat = await stat(source);
    const key = createHash("sha256").update(`${source}:${sourceStat.mtimeMs}:${sourceStat.size}:${size}`).digest("hex");
    const destination = path.join(this.cacheDir, key.slice(0, 2), `${key}.jpg`);
    try {
      await stat(destination);
      return destination;
    } catch {
      // Generate the missing cache entry below.
    }

    const existing = this.pending.get(destination);
    if (existing) return existing;
    const task = this.generate(source, destination, kind, size).finally(() => this.pending.delete(destination));
    this.pending.set(destination, task);
    return task;
  }

  private async generate(source: string, destination: string, kind: MediaKind, size: number): Promise<string> {
    await mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    if (kind === "image") {
      if (path.extname(source).toLowerCase() === ".bmp") await generateFfmpegThumbnail(source, temporary, size, false);
      else await sharp(source, { animated: false }).rotate().resize(size, size, { fit: "cover", position: "attention" }).jpeg({ quality: 78, mozjpeg: true }).toFile(temporary);
    } else {
      await generateFfmpegThumbnail(source, temporary, size, true);
    }
    await rename(temporary, destination);
    return destination;
  }
}

function generateFfmpegThumbnail(source: string, destination: string, size: number, seekVideo: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", ...(seekVideo ? ["-ss", "1"] : []), "-i", source, "-frames:v", "1",
      "-vf", `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size}`,
      "-q:v", "4", "-vcodec", "mjpeg", "-f", "image2", "-y", destination,
    ]);
    let errorOutput = "";
    process.stderr.on("data", (chunk) => { errorOutput += String(chunk); });
    process.once("error", () => reject(new AppError("ffmpeg is not available for thumbnail generation.", 503, "FFMPEG_UNAVAILABLE")));
    process.once("exit", (code) => code === 0 ? resolve() : reject(new AppError(`Could not generate thumbnail: ${errorOutput.trim()}`, 422, "THUMBNAIL_FAILED")));
  });
}
