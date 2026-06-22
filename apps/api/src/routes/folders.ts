import type { FastifyInstance } from "fastify";
import type { CreateFolderRequest, MoveAdrRequest } from "@adr/shared";
import type { Container } from "../container.js";

export async function folderRoutes(app: FastifyInstance, opts: { container: Container }): Promise<void> {
  const { container } = opts;

  app.post("/api/folders", async (request, reply) => {
    const body = request.body as Partial<CreateFolderRequest>;

    const missingFields: string[] = [];
    if (typeof body.path !== "string" || body.path.length === 0) missingFields.push("path");
    if (typeof body.author !== "string" || body.author.length === 0) missingFields.push("author");
    if (missingFields.length > 0) {
      return reply.status(400).send({ missingFields });
    }

    const { path, author } = body as CreateFolderRequest;
    const result = await container.writeQueue.enqueue(() => container.folders.createFolder(path, author));

    switch (result.kind) {
      case "created":
        return reply.status(201).send(result.node);
      case "conflict":
        return reply.status(409).send();
    }
  });

  app.post("/api/adrs/:id/move", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<MoveAdrRequest>;

    const missingFields: string[] = [];
    if (typeof body.targetFolder !== "string" || body.targetFolder.length === 0) missingFields.push("targetFolder");
    if (typeof body.author !== "string" || body.author.length === 0) missingFields.push("author");
    if (missingFields.length > 0) {
      return reply.status(400).send({ missingFields });
    }

    const { targetFolder, author } = body as MoveAdrRequest;
    const result = await container.writeQueue.enqueue(() => container.folders.moveAdr(id, targetFolder, author));

    switch (result.kind) {
      case "moved":
        return reply.status(200).send(result.adr);
      case "notFound":
        return reply.status(404).send();
    }
  });

  app.get("/api/tree", async (request, reply) => {
    const { root } = request.query as { root?: string };
    const rootPath = typeof root === "string" && root.length > 0 ? root : ".";

    const tree = await container.folders.buildTree(rootPath);
    return reply.status(200).send(tree);
  });
}
