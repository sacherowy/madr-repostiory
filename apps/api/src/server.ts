import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { buildContainer, type Container } from "./container.js";
import { adrRoutes } from "./routes/adrs.js";
import { relationRoutes } from "./routes/relations.js";
import { folderRoutes } from "./routes/folders.js";
import { historyRoutes } from "./routes/history.js";
import { compareRoutes } from "./routes/compare.js";
import { searchRoutes } from "./routes/search.js";
import { similarityRoutes } from "./routes/similarity.js";

/**
 * Builds a fully-wired Fastify instance for a given `Container`, without
 * binding a real network port. Kept separate from the process-entrypoint
 * logic below so tests can call this directly and exercise routes via
 * `app.inject()`.
 */
export async function buildServer(container: Container): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    status: "ok",
    sourceOfTruth: "git",
    repo: config.repoPath,
  }));

  await app.register(adrRoutes, { container });
  await app.register(relationRoutes, { container });
  await app.register(folderRoutes, { container });
  await app.register(historyRoutes, { container });
  await app.register(compareRoutes, { container });
  await app.register(searchRoutes, { container });
  await app.register(similarityRoutes, { container });

  return app;
}

// Only start listening on a real port when this file is run directly as the
// process entrypoint (e.g. `tsx watch src/server.ts`), not when it's merely
// imported by a test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const container = buildContainer(config);

  buildServer(container)
    .then((app) =>
      app
        .listen({ port: config.port, host: "0.0.0.0" })
        .then(() => app.log.info(`ADR Manager API :${config.port}`))
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
