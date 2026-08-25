import type { MediaRoot } from "@these/shared";
import { configureMediaRoot, type ConfiguredRoot } from "../config.js";
import { AppError } from "../lib/errors.js";
import type { Repository } from "./repository.js";

const settingKey = "media_roots";

interface StoredMediaRoot {
  label: string;
  path: string;
}

export class MediaRootService {
  private constructor(private readonly repository: Repository, private roots: ConfiguredRoot[]) {}

  static async create(repository: Repository, seed: ConfiguredRoot[] = []): Promise<MediaRootService> {
    const stored = await repository.getSetting(settingKey);
    if (stored !== null) return new MediaRootService(repository, await parseStoredRoots(stored));
    const service = new MediaRootService(repository, seed);
    if (seed.length > 0) await service.persist(seed);
    return service;
  }

  getConfiguredRoots(): ConfiguredRoot[] {
    return this.roots;
  }

  getPublicRoots(): MediaRoot[] {
    return this.roots.map(({ canonicalPath: _, ...root }) => root);
  }

  async refresh(): Promise<MediaRoot[]> {
    this.roots = await Promise.all(this.roots.map((root) => configureMediaRoot(root.label, root.path)));
    return this.getPublicRoots();
  }

  async createRoot(values: { label?: string; path?: string }): Promise<MediaRoot> {
    const root = await buildRoot(values.label, values.path);
    this.assertUniquePath(root.path);
    await this.replaceRoots([...this.roots, root]);
    return publicRoot(root);
  }

  async updateRoot(id: string, values: { label?: string; path?: string }): Promise<MediaRoot> {
    const index = this.roots.findIndex((root) => root.id === id);
    if (index < 0) throw new AppError("Media root not found.", 404, "MEDIA_ROOT_NOT_FOUND");
    const current = this.roots[index]!;
    const root = await buildRoot(values.label ?? current.label, values.path ?? current.path);
    this.assertUniquePath(root.path, id);
    const next = [...this.roots];
    next[index] = root;
    await this.replaceRoots(next);
    return publicRoot(root);
  }

  async deleteRoot(id: string): Promise<void> {
    const next = this.roots.filter((root) => root.id !== id);
    if (next.length === this.roots.length) return;
    await this.replaceRoots(next);
  }

  private assertUniquePath(rootPath: string, excludedId?: string) {
    if (this.roots.some((root) => root.id !== excludedId && root.path === rootPath)) {
      throw new AppError("That media root is already configured.", 409, "DUPLICATE_MEDIA_ROOT");
    }
  }

  private async replaceRoots(roots: ConfiguredRoot[]) {
    await this.persist(roots);
    this.roots = roots;
  }

  private async persist(roots: ConfiguredRoot[]) {
    const stored: StoredMediaRoot[] = roots.map(({ label, path }) => ({ label, path }));
    await this.repository.setSetting(settingKey, JSON.stringify(stored));
  }
}

async function buildRoot(label: string | undefined, rootPath: string | undefined): Promise<ConfiguredRoot> {
  try {
    return await configureMediaRoot(label, rootPath ?? "");
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Invalid media root.");
  }
}

async function parseStoredRoots(value: string): Promise<ConfiguredRoot[]> {
  let stored: unknown;
  try {
    stored = JSON.parse(value);
  } catch {
    throw new Error("Stored media root configuration is invalid JSON.");
  }
  if (!Array.isArray(stored)) throw new Error("Stored media root configuration must be an array.");
  const roots: ConfiguredRoot[] = [];
  const paths = new Set<string>();
  for (const candidate of stored) {
    if (!candidate || typeof candidate !== "object") throw new Error("Stored media root configuration contains an invalid entry.");
    const { label, path } = candidate as Partial<StoredMediaRoot>;
    if (typeof label !== "string" || typeof path !== "string") throw new Error("Stored media root configuration contains an invalid entry.");
    const root = await configureMediaRoot(label, path);
    if (!paths.has(root.path)) {
      paths.add(root.path);
      roots.push(root);
    }
  }
  return roots;
}

function publicRoot({ canonicalPath: _, ...root }: ConfiguredRoot): MediaRoot {
  return root;
}
