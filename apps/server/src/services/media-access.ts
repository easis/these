import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type { ConfiguredRoot } from "../config.js";
import { AppError } from "../lib/errors.js";

export interface ResolvedMediaPath {
  requestedPath: string;
  canonicalPath: string | null;
  root: ConfiguredRoot;
}

function isContained(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export class MediaAccess {
  constructor(private readonly getRoots: () => ConfiguredRoot[]) {}

  validateReference(input: string): ResolvedMediaPath {
    if (!input || input.includes("\0")) throw new AppError("A valid media path is required.");
    if (!path.isAbsolute(input)) throw new AppError("Media paths must be absolute.", 400, "INVALID_PATH");
    const requestedPath = path.resolve(input);
    const root = this.getRoots()
      .filter((candidate) => isContained(candidate.path, requestedPath))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!root) throw new AppError("Path is outside the configured media roots.", 403, "PATH_OUTSIDE_ROOTS");
    return { requestedPath, canonicalPath: null, root };
  }

  async resolveExisting(input: string, expected?: "file" | "directory"): Promise<ResolvedMediaPath> {
    const reference = this.validateReference(input);
    if (!reference.root.canonicalPath) throw new AppError("The media root is unavailable.", 404, "ROOT_UNAVAILABLE");

    let canonicalPath: string;
    try {
      canonicalPath = await realpath(reference.requestedPath);
    } catch (error) {
      throw pathAccessError(error);
    }
    if (!isContained(reference.root.canonicalPath, canonicalPath)) {
      throw new AppError("Resolved path escapes the configured media root.", 403, "SYMLINK_ESCAPE");
    }
    let stats;
    try {
      stats = await lstat(canonicalPath);
    } catch (error) {
      throw pathAccessError(error);
    }
    if (expected === "file" && !stats.isFile()) throw new AppError("The requested path is not a file.", 400, "PATH_TYPE_MISMATCH");
    if (expected === "directory" && !stats.isDirectory()) throw new AppError("The requested path is not a folder.", 400, "PATH_TYPE_MISMATCH");
    return { ...reference, canonicalPath };
  }

  async exists(input: string, expected?: "file" | "directory"): Promise<boolean> {
    try {
      await this.resolveExisting(input, expected);
      return true;
    } catch {
      return false;
    }
  }
}

function pathAccessError(error: unknown): AppError {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new AppError("The requested path is no longer available.", 404, "PATH_MISSING");
  }
  return new AppError("The requested path is temporarily unavailable.", 503, "PATH_UNAVAILABLE");
}
