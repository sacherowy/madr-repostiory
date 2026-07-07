import type { FastifyInstance } from "fastify";
import { parseAdr } from "@adr/core";
import type { Adr } from "@adr/shared";
import type { Container } from "../container.js";

/**
 * Scans every current ADR file to find the one whose frontmatter id matches —
 * the same deliberate per-plugin scan convention `adrs.ts` documents (GitPort
 * has no find-by-id lookup).
 */
async function findAdrById(container: Container, id: string): Promise<Adr | undefined> {
  const files = await container.git.listAdrFiles(".");
  for (const file of files) {
    const raw = await container.git.read(file.path);
    const adr = parseAdr(raw, file.path, file.blobSha);
    if (adr.id === id) return adr;
  }
  return undefined;
}

/**
 * `GET /api/adrs/:id/summary-suggestion` -> `SummarySuggestionResult`
 * (req 13.1, 13.2, 13.5). BOTH union variants are HTTP 200: the absence of an
 * AI provider (or a provider failure) is a normal, expected outcome the
 * client renders by falling back to the deterministic short description —
 * not an error. 404 is reserved for an unknown ADR id. Cache-first behavior
 * (13.2) lives entirely in `SummarySuggestionService`.
 */
export async function summariesRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.get("/api/adrs/:id/summary-suggestion", async (request, reply) => {
    const { id } = request.params as { id: string };
    const adr = await findAdrById(container, id);
    if (!adr) {
      return reply.status(404).send();
    }

    const result = await container.summarySuggestion.suggest(adr);
    return reply.status(200).send(result);
  });
}
