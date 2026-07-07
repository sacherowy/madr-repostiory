import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

/**
 * Pure read endpoint: `GET /api/feed` -> `FeedCard[]` (req 2.3). The cards
 * are assembled per request by `FeedService` (same repo scan cost profile as
 * `GET /api/tree`); nothing is written, so this plugin has no WriteQueue
 * involvement. Additive route — no existing contract changes (req 15.3).
 */
export async function feedRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/feed", async (request, reply) => {
    const cards = await container.feed.buildFeed();
    return reply.status(200).send(cards);
  });
}
