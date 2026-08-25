import type { Stats } from "node:fs";
import { stat as statAsync } from "node:fs/promises";
import path from "node:path";

export interface AvailableMediaFile {
  name: string;
  requestedPath: string;
  stats: Stats;
}

export async function statMediaPage(canonicalDirectory: string, requestedDirectory: string, names: string[]): Promise<AvailableMediaFile[]> {
  const results = await Promise.allSettled(names.map(async (name): Promise<AvailableMediaFile> => ({
    name,
    requestedPath: path.join(requestedDirectory, name),
    stats: await statAsync(path.join(canonicalDirectory, name)),
  })));
  const available: AvailableMediaFile[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      available.push(result.value);
      continue;
    }
    if (!isDisappearedPathError(result.reason)) throw result.reason;
  }
  return available;
}

function isDisappearedPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
