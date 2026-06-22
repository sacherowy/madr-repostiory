import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

/**
 * Pure read endpoint: relations are never written directly (only as a side
 * effect of `AdrEditingService.save`, handled by `adrRoutes`'s PUT handler),
 * so this plugin has no WriteQueue involvement at all.
 *
 * `targetExists` is called first to distinguish "ADR exists with zero
 * relations" (200 + []) from "ADR id doesn't exist at all" (404) — unlike
 * `relationsFor`, which never signals "not found" on its own (it would
 * simply return [] for a nonexistent id, indistinguishable from a real ADR
 * with no relations).
 */
export async function relationRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/adrs/:id/relations", async (request, reply) => {
    const { id } = request.params as { id: string };

    const exists = await container.relations.targetExists(id);
    if (!exists) {
      return reply.status(404).send();
    }

    const views = await container.relations.relationsFor(id);
    return reply.status(200).send(views);
  });
}
