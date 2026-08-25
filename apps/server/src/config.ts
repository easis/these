import { createHash } from "node:crypto";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaRoot } from "@these/shared";
import dotenvFlow from "dotenv-flow";

export interface ConfiguredRoot extends MediaRoot {
  canonicalPath: string | null;
}

export interface AppConfig {
  dataDir: string;
  roots: ConfiguredRoot[];
  host: string;
  port: number;
  logLevel: string;
  migrationsDir: string;
  webDistDir: string;
}

export async function loadConfig(overrides: Partial<AppConfig> = {}): Promise<AppConfig> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(moduleDirectory, "../../..");
  const environmentFiles = dotenvFlow.listFiles({
    path: projectRoot,
    node_env: process.env.NODE_ENV ?? "development",
  });
  if (environmentFiles.length > 0) {
    const environment = dotenvFlow.load(environmentFiles, { silent: true });
    if (environment.error) throw environment.error;
  }
  const configuredDataDir = overrides.dataDir ?? process.env.DATA_DIR ?? "/data";
  return {
    dataDir: path.isAbsolute(configuredDataDir) ? configuredDataDir : path.resolve(projectRoot, configuredDataDir),
    roots: overrides.roots ?? [],
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    port: overrides.port ?? Number(process.env.PORT ?? 4000),
    logLevel: overrides.logLevel ?? process.env.LOG_LEVEL ?? "info",
    migrationsDir: overrides.migrationsDir ?? path.resolve(moduleDirectory, "../drizzle"),
    webDistDir: overrides.webDistDir ?? path.resolve(moduleDirectory, "../../web/dist"),
  };
}

export async function parseMediaRoots(spec: string): Promise<ConfiguredRoot[]> {
  const entries = spec.split(",").map((entry) => entry.trim()).filter(Boolean);
  const seen = new Set<string>();
  const roots: ConfiguredRoot[] = [];

  for (const entry of entries) {
    const separator = entry.indexOf("=");
    const explicitLabel = separator > 0 ? entry.slice(0, separator).trim() : undefined;
    const rawPath = separator > 0 ? entry.slice(separator + 1).trim() : entry;
    const configured = await configureMediaRoot(explicitLabel, rawPath);
    const normalizedPath = configured.path;
    if (seen.has(normalizedPath)) continue;
    seen.add(normalizedPath);
    roots.push(configured);
  }
  return roots;
}

export async function configureMediaRoot(label: string | undefined, inputPath: string): Promise<ConfiguredRoot> {
  const cleanPath = inputPath.trim();
  if (!cleanPath || cleanPath.includes("\0") || !path.isAbsolute(cleanPath)) throw new Error("Media root paths must be absolute.");
  const normalizedPath = path.resolve(cleanPath);
  const cleanLabel = label?.trim() || path.basename(normalizedPath) || normalizedPath;
  if (cleanLabel.length > 100) throw new Error("Media root labels cannot exceed 100 characters.");

  let canonicalPath: string | null = null;
  try {
    await access(normalizedPath);
    const rootStats = await stat(normalizedPath);
    if (rootStats.isDirectory()) canonicalPath = await realpath(normalizedPath);
  } catch {
    // Unavailable roots remain configurable so a mount can be attached later.
  }

  return {
    id: createHash("sha1").update(normalizedPath).digest("hex").slice(0, 12),
    label: cleanLabel,
    path: normalizedPath,
    canonicalPath,
    available: canonicalPath !== null,
  };
}
