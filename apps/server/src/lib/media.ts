import type { MediaKind } from "@these/shared";
import path from "node:path";

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".bmp", ".webp", ".avif", ".gif", ".tif", ".tiff", ".heic", ".heif"]);
const videoExtensions = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"]);

export function mediaKindForPath(mediaPath: string): MediaKind | null {
  const extension = path.extname(mediaPath).toLowerCase();
  if (imageExtensions.has(extension)) return "image";
  if (videoExtensions.has(extension)) return "video";
  return null;
}

export function mimeTypeForPath(mediaPath: string): string {
  const extension = path.extname(mediaPath).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".bmp": "image/bmp", ".webp": "image/webp",
    ".avif": "image/avif", ".gif": "image/gif", ".tif": "image/tiff", ".tiff": "image/tiff",
    ".heic": "image/heic", ".heif": "image/heif", ".mp4": "video/mp4", ".mov": "video/quicktime",
    ".m4v": "video/x-m4v", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo",
  };
  return types[extension] ?? "application/octet-stream";
}
