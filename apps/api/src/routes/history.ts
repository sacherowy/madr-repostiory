import type { FastifyInstance } from "fastify";
import type { Container } from "../container.js";

/**
 * Pure read endpoints: history, a specific historical version's content, and
 * a version-to-version diff are never written directly (only ever produced
 * as a side effect of `AdrEditingService.save`, handled by `adrRoutes`'s PUT
 * handler), so this plugin has no WriteQueue involvement at all.
 *
 * `HistoryService.timeline`/`versionAt` both throw a plain Error when `id`
 * doesn't resolve to any ADR (unlike `FolderService`'s/`ComparisonService`'s
 * null/notFound-result style) — both routes below catch-all to 404, which is
 * correct since their documented contracts list only 404, no 400, and
 * `versionAt`'s second throw cause (a sha with no matching blob/commit for
 * that ADR's path) also legitimately maps to 404.
 *
 * The diff route's contract documents both 400 and 404, but
 * `ComparisonService.versionDiff` never throws and only ever returns a flat
 * `{kind:"invalid", reason}` for every rejection case (missing from/to,
 * id-not-found, and mismatched-ADR shas all look identical at that level).
 * Existence is therefore checked first via `RelationGraphService.targetExists`
 * (already used by `relations.ts` for the same purpose) so a not-found id
 * short-circuits to 404 before `versionDiff` is ever called; any
 * `{kind:"invalid"}` returned after that point is unambiguously a 400.
 */
export async function historyRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/adrs/:id/history", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const commits = await container.history.timeline(id);
      return reply.status(200).send(commits);
    } catch {
      return reply.status(404).send();
    }
  });

  app.get("/api/adrs/:id/versions/:sha", async (request, reply) => {
    const { id, sha } = request.params as { id: string; sha: string };

    try {
      const adr = await container.history.versionAt(id, sha);
      return reply.status(200).send(adr);
    } catch {
      return reply.status(404).send();
    }
  });

  app.get("/api/adrs/:id/diff", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from?: string; to?: string };

    const exists = await container.relations.targetExists(id);
    if (!exists) {
      return reply.status(404).send();
    }

    const result = await container.compare.versionDiff(id, from ?? "", to ?? "");

    switch (result.kind) {
      case "ok":
        return reply.status(200).send(result.view);
      case "invalid":
        return reply.status(400).send({ reason: result.reason });
    }
  });
}
