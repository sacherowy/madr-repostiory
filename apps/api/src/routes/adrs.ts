import type { FastifyInstance } from "fastify";
import { parseAdr } from "@adr/core";
import type { Adr, CreateAdrRequest, UpdateAdrRequest } from "@adr/shared";
import type { Container } from "../container.js";

/**
 * `CreateAdrRequest` (the literal shared type) has no `author` field, but
 * `AdrEditingService.create` requires one as a separate argument. Every
 * other write-request DTO in `@adr/shared` (`CreateFolderRequest`,
 * `MoveAdrRequest`, `UpdateAdrRequest`) carries `author` directly, so this is
 * most likely a spec oversight specific to `CreateAdrRequest` rather than a
 * deliberate omission — mirrors the same locally-scoped-type technique
 * `editingService.ts` uses for `SaveAdrInput`.
 */
type CreateAdrBody = CreateAdrRequest & { author: string };

/**
 * Scans every current ADR file to find the one whose frontmatter id matches.
 * GitPort has no find-by-id lookup, so this duplicates the exact scan
 * pattern already used independently inside `FolderService`,
 * `RelationGraphService`, `HistoryService`, `ComparisonService`,
 * `SimilarityService`, and `AdrEditingService` — the established, deliberate
 * convention in this codebase rather than a shared utility.
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

export async function adrRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.post("/api/adrs", async (request, reply) => {
    const body = request.body as Partial<CreateAdrBody>;

    const missingFields: string[] = [];
    if (typeof body.title !== "string" || body.title.length === 0) missingFields.push("title");
    if (typeof body.folder !== "string" || body.folder.length === 0) missingFields.push("folder");
    if (typeof body.author !== "string" || body.author.length === 0) missingFields.push("author");
    if (missingFields.length > 0) {
      return reply.status(400).send({ missingFields });
    }

    const { author, ...input } = body as CreateAdrBody;
    const adr = await container.writeQueue.enqueue(() => container.adrEditing.create(input, author));
    return reply.status(201).send(adr);
  });

  app.get("/api/adrs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const adr = await findAdrById(container, id);
    if (!adr) {
      return reply.status(404).send();
    }
    return reply.status(200).send(adr);
  });

  app.put("/api/adrs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { author, baseBlobSha, ...input } = request.body as UpdateAdrRequest;

    try {
      const result = await container.writeQueue.enqueue(() =>
        container.adrEditing.save(id, input, baseBlobSha, author)
      );

      switch (result.kind) {
        case "saved":
          return reply.status(200).send(result.adr);
        case "conflict":
          return reply.status(409).send({ latest: result.latest });
        case "invalid":
          return reply.status(400).send({ missingFields: result.missingFields });
        case "invalidRelations":
          return reply.status(400).send({ missingTargets: result.missingTargets });
      }
    } catch {
      // save() only throws when `id` does not resolve to any ADR.
      return reply.status(404).send();
    }
  });
}
