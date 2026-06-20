import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

/**
 * Pure read endpoint: keyword search never writes anything, so this plugin
 * has no WriteQueue involvement at all.
 *
 * `SearchService.search` (a thin pass-through to `SqliteSearchIndex.search`)
 * never throws and already safely handles a missing/empty/whitespace-only
 * `q` by returning `[]` directly (see `toFtsMatchExpression`'s null
 * short-circuit). Per design.md's documented contract for this endpoint
 * (`GET /api/search?q` -> `SearchHit[]`, errors: none — the only route in
 * the whole API with zero documented error codes), there is deliberately no
 * missing-field validation here: a missing `q` simply flows through as an
 * empty string and yields `200 + []`, which is also exactly what requirement
 * 9.3 describes at the API layer ("no matches" -> empty result, not an
 * error). Ranking (9.2) is entirely the index's job (bm25()); this route
 * returns results in the order the service provides them.
 *
 * Fastify parses a repeated query key (`?q=a&q=b`) as a string array, which
 * `SqliteSearchIndex.search` would otherwise crash on (`query.trim` is not a
 * function on an array) — `q` is narrowed to its first value in that case so
 * the "never throws" contract genuinely holds for every Fastify-parsable
 * shape of `q`, not just the single-string case.
 */
export async function searchRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/search", async (request, reply) => {
    const { q } = request.query as { q?: string | string[] };
    const query = Array.isArray(q) ? q[0] : q;

    const hits = await container.search.search(query ?? "");
    return reply.status(200).send(hits);
  });
}
