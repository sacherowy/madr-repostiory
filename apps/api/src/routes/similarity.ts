import type { FastifyInstance } from "fastify";
import { SimilarityProviderError } from "@adr/core";
import type { Container } from "../container.js";

/**
 * Pure read endpoint: similarity search never writes anything, so this
 * plugin has no WriteQueue involvement at all.
 *
 * `SimilarityService.findSimilar` throws a plain Error when `id` doesn't
 * resolve to an ADR inside the given `scopePath` (mirroring
 * `HistoryService.timeline`/`versionAt`'s throw-style, not
 * `ComparisonService`'s/`FolderService`'s result-union style) — this
 * uniformly covers both a genuinely nonexistent id and a real id that exists
 * elsewhere in the repo but outside the requested scope, so both map to 404
 * via the same catch, exactly like `history.ts`'s `/history` and
 * `/versions/:sha` routes.
 *
 * Per design.md's Error Categories table, the two success cases have
 * deliberately different response shapes at 200: `{kind:"ranked"}` unwraps
 * to the raw `SimilarityResult[]` (the documented contract's return type),
 * while `{kind:"emptyScope"}` (req 10.3) is sent as the literal
 * `{ kind: "emptyScope" }` object — NOT collapsed into `[]` — so the client
 * can distinguish "no other ADRs in this scope" from an array that just
 * happens to be empty.
 *
 * `scope` defaults to "." (whole repo) when missing/empty, mirroring
 * `folders.ts`'s `GET /api/tree?root` default. Fastify parses a repeated
 * query key (`?scope=a&scope=b`) as a string array, not a string — `scope`
 * is narrowed to its first value in that case, mirroring the fix already
 * applied to `search.ts`'s analogous `q` param.
 *
 * `exhaustive` is parsed the same way (first value of a repeated key); only
 * the literal `"true"` enables it, and `{ exhaustive }` is always passed to
 * the finder, which the embedding strategy ignores (4.9, 5.7). A ranked
 * result that carries `coverage` (jev only) gets `X-Similarity-Judged` /
 * `X-Similarity-Candidates` headers; the body is never changed (5.1, 5.6).
 *
 * A `SimilarityProviderError` (any category, including "budget") maps to
 * 503 `{ kind: "providerUnavailable" }` with a warn log carrying only the
 * category and HTTP status — never the message, which could echo provider
 * output (7.1, 7.5, 7.6). Every other error stays an empty 404 (5.4).
 */
export async function similarityRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/adrs/:id/similar", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { scope, exhaustive: exhaustiveParam } = request.query as {
      scope?: string | string[];
      exhaustive?: string | string[];
    };
    const scopeValue = Array.isArray(scope) ? scope[0] : scope;
    const scopePath = typeof scopeValue === "string" && scopeValue.length > 0 ? scopeValue : ".";
    const exhaustiveValue = Array.isArray(exhaustiveParam) ? exhaustiveParam[0] : exhaustiveParam;
    const exhaustive = exhaustiveValue === "true";

    try {
      const result = await container.similarity.findSimilar(id, scopePath, { exhaustive });

      switch (result.kind) {
        case "ranked":
          if (result.coverage) {
            const { judged, total } = result.coverage;
            reply.header("X-Similarity-Judged", String(judged));
            reply.header("X-Similarity-Candidates", String(total));
            if (exhaustive) request.log.info({ judged, total }, "similarity exhaustive comparison");
          }
          return reply.status(200).send(result.results);
        case "emptyScope":
          return reply.status(200).send({ kind: "emptyScope" });
      }
    } catch (err) {
      if (err instanceof SimilarityProviderError) {
        request.log.warn({ category: err.category, httpStatus: err.httpStatus }, "similarity provider unavailable");
        return reply.status(503).send({ kind: "providerUnavailable" });
      }
      return reply.status(404).send();
    }
  });
}
