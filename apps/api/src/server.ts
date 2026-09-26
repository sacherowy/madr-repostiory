import Fastify, { type FastifyInstance } from "fastify";
import { config, similarityConfigResult } from "./config.js";
import { buildContainer, type Container, type ContainerConfig } from "./container.js";
import { formatConfigIssues, type SimilarityConfigResult } from "./similarityConfig.js";
import { adrRoutes } from "./routes/adrs.js";
import { relationRoutes } from "./routes/relations.js";
import { folderRoutes } from "./routes/folders.js";
import { historyRoutes } from "./routes/history.js";
import { compareRoutes } from "./routes/compare.js";
import { searchRoutes } from "./routes/search.js";
import { similarityRoutes } from "./routes/similarity.js";
import { feedRoutes } from "./routes/feed.js";
import { summariesRoutes } from "./routes/summaries.js";

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
    // Only the strategy name, read from the container, never the environment or JEV_* values (5.5, 2.7).
    similarity: { strategy: container.similarityStrategy },
  }));

  await app.register(adrRoutes, { container });
  await app.register(relationRoutes, { container });
  await app.register(folderRoutes, { container });
  await app.register(historyRoutes, { container });
  await app.register(compareRoutes, { container });
  await app.register(searchRoutes, { container });
  await app.register(similarityRoutes, { container });
  await app.register(feedRoutes, { container });
  await app.register(summariesRoutes, { container });

  return app;
}

export interface StartupDeps {
  stderr: { write(chunk: string): unknown };
  exit(code: number): never;
  build(cfg: ContainerConfig): Container;
}

const processDeps: StartupDeps = {
  stderr: process.stderr,
  exit: (code) => process.exit(code),
  build: buildContainer,
};

/**
 * Startup configuration gate: an invalid similarity configuration is reported
 * as one aggregated message on stderr and aborts with exit code 1 before any
 * container is built (2.1–2.7, 2.10). Otherwise the container is built once
 * with the validated configuration for the whole process lifetime (1.5).
 */
export function containerFromConfig(
  base: ContainerConfig,
  similarity: SimilarityConfigResult,
  deps: StartupDeps = processDeps
): Container {
  if (!similarity.ok) {
    deps.stderr.write(`${formatConfigIssues(similarity.issues)}\n`);
    return deps.exit(1);
  }
  return deps.build({ ...base, similarity: similarity.config });
}

// Only start listening on a real port when this file is run directly as the
// process entrypoint (e.g. `tsx watch src/server.ts`), not when it's merely
// imported by a test file.
if (import.meta.url === `file://${process.argv[1]}`) {
  const container = containerFromConfig(config, similarityConfigResult);

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
