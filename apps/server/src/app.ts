import fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config.js";
import { createDatabase } from "./db/index.js";
import { AppError } from "./lib/errors.js";
import { registerApi } from "./routes/api.js";
import { MediaAccess } from "./services/media-access.js";
import { MediaMetadataService } from "./services/media-metadata.js";
import { MediaRootService } from "./services/media-roots.js";
import { Repository } from "./services/repository.js";
import { ThumbnailService } from "./services/thumbnails.js";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = fastify({ logger: config.logLevel === "silent" ? false : { level: config.logLevel } });
  const database = createDatabase(config.dataDir, config.migrationsDir);
  const repository = new Repository(database.db);
  const mediaRoots = await MediaRootService.create(repository, config.roots);
  const mediaAccess = new MediaAccess(() => mediaRoots.getConfiguredRoots());
  const mediaMetadata = new MediaMetadataService();
  const thumbnails = new ThumbnailService(path.join(config.dataDir, "cache"));

  app.addHook("onClose", async () => database.sqlite.close());
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return reply.code(409).send({ error: "That path is already referenced by another record.", code: "DUPLICATE_REFERENCE" });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "The server could not complete the request.", code: "INTERNAL_ERROR" });
  });

  await registerApi(app, { mediaAccess, mediaMetadata, mediaRoots, repository, thumbnails });

  if (existsSync(path.join(config.webDistDir, "index.html"))) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "API route not found.", code: "NOT_FOUND" });
      return reply.sendFile("index.html");
    });
  }
  return app;
}
