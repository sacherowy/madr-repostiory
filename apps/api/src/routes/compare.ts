import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

/**
 * Pure read endpoint: comparing two ADRs never writes anything, so this
 * plugin has no WriteQueue involvement at all.
 *
 * `ComparisonService.adrDiff` never throws and conflates three distinct
 * rejection causes into a single flat `{kind:"invalid", reason}`: idA===idB,
 * idA not found, and idB not found. Per design.md's documented error list
 * (400, 404) and requirement 8.3 ("reject the comparison and inform the user
 * two distinct ADRs are required" is a client error, not a not-found), these
 * need to map to different status codes, so every rejection is checked here
 * BEFORE `adrDiff` is ever called, in this precedence order:
 *
 *   1. Missing `a`/`b` query params -> 400 + {missingFields}, mirroring the
 *      required-field validation convention used by adrRoutes/folderRoutes
 *      for caller-supplied input (a 400, not a service call at all).
 *   2. `a === b` -> 400, regardless of whether that id exists. This must be
 *      checked before any existence check: if both ids are equal AND
 *      bogus/nonexistent, requirement 8.3's "two distinct ADRs required"
 *      framing still applies rather than a not-found.
 *   3. Existence of `a` and `b` (via `RelationGraphService.targetExists`,
 *      the same existence-check primitive `relations.ts`/`history.ts`
 *      already reuse) -> 404 if either is missing.
 *
 * By the time all three checks pass, `a` and `b` are present, distinct, and
 * both resolve to real ADRs - every cause `adrDiff` could ever report as
 * {kind:"invalid"} has already been ruled out, so its result here can only
 * ever be {kind:"ok"}. The "invalid" branch is kept purely as a defensive
 * fallback (mirrors the discriminated union's full case set) and should be
 * unreachable in practice.
 */
export async function compareRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/compare", async (request, reply) => {
    const query = request.query as { a?: string; b?: string };

    const missingFields: string[] = [];
    if (typeof query.a !== "string" || query.a.length === 0) missingFields.push("a");
    if (typeof query.b !== "string" || query.b.length === 0) missingFields.push("b");
    if (missingFields.length > 0) {
      return reply.status(400).send({ missingFields });
    }
    const { a, b } = query as { a: string; b: string };

    if (a === b) {
      return reply.status(400).send({ reason: "two distinct ADRs are required for comparison" });
    }

    const [existsA, existsB] = await Promise.all([
      container.relations.targetExists(a),
      container.relations.targetExists(b),
    ]);
    if (!existsA || !existsB) {
      return reply.status(404).send();
    }

    const result = await container.compare.adrDiff(a, b);

    switch (result.kind) {
      case "ok":
        return reply.status(200).send(result.view);
      case "invalid":
        return reply.status(400).send({ reason: result.reason });
    }
  });
}
