import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
import { adrRoutes } from "./adrs.js";
import { folderRoutes } from "./folders.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "folder-routes-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("folderRoutes", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;

  beforeEach(async () => {
    repoPath = await initRepo();
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    // Seed an initial commit so listAdrFiles/listTreeEntries have a HEAD to scan against.
    await container.git.writeAndCommit(
      "decisions/.gitkeep",
      "",
      "init repo",
      AUTHOR
    );

    app = Fastify();
    await app.register(adrRoutes, { container });
    await app.register(folderRoutes, { container });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("creates a folder and returns 201 with the FolderNode, then GET /api/tree includes it even though empty", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "decisions/empty-folder", author: AUTHOR },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.path).toBe("decisions/empty-folder");
    expect(created.name).toBe("empty-folder");
    expect(created.folders).toEqual([]);
    expect(created.adrs).toEqual([]);

    const treeRes = await app.inject({ method: "GET", url: "/api/tree" });
    expect(treeRes.statusCode).toBe(200);
    const tree = treeRes.json();

    const decisionsNode = tree.folders.find((f: { path: string }) => f.path === "decisions");
    expect(decisionsNode).toBeDefined();
    const emptyFolderNode = decisionsNode.folders.find(
      (f: { path: string }) => f.path === "decisions/empty-folder"
    );
    expect(emptyFolderNode).toBeDefined();
    expect(emptyFolderNode.folders).toEqual([]);
    expect(emptyFolderNode.adrs).toEqual([]);
  });

  it("rejects creating a folder that already exists at the same location with 409", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "decisions/duplicate", author: AUTHOR },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "decisions/duplicate", author: AUTHOR },
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects POST /api/folders missing path with 400 naming the missing field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { author: AUTHOR },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().missingFields).toContain("path");
  });

  it("rejects POST /api/folders missing author with 400 naming the missing field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "decisions/new-folder" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().missingFields).toContain("author");
  });

  it("moves an existing ADR to a different folder, returns 200 with updated path, and GET /api/tree reflects the move", async () => {
    const createAdrRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    const createdAdr = createAdrRes.json();

    const createFolderRes = await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "archive", author: AUTHOR },
    });
    expect(createFolderRes.statusCode).toBe(201);

    const moveRes = await app.inject({
      method: "POST",
      url: `/api/adrs/${createdAdr.id}/move`,
      payload: { targetFolder: "archive", author: AUTHOR },
    });

    expect(moveRes.statusCode).toBe(200);
    const moved = moveRes.json();
    expect(moved.id).toBe(createdAdr.id);
    expect(moved.path).toMatch(/^archive\//);

    const treeRes = await app.inject({ method: "GET", url: "/api/tree" });
    const tree = treeRes.json();

    const archiveNode = tree.folders.find((f: { path: string }) => f.path === "archive");
    expect(archiveNode).toBeDefined();
    expect(archiveNode.adrs.some((a: { id: string }) => a.id === createdAdr.id)).toBe(true);

    const decisionsNode = tree.folders.find((f: { path: string }) => f.path === "decisions");
    expect(decisionsNode.adrs.some((a: { id: string }) => a.id === createdAdr.id)).toBe(false);
  });

  it("returns 404 when moving a nonexistent ADR id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs/adr-9999/move",
      payload: { targetFolder: "archive", author: AUTHOR },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects POST /api/adrs/:id/move missing targetFolder with 400 naming the missing field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs/adr-9999/move",
      payload: { author: AUTHOR },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().missingFields).toContain("targetFolder");
  });

  it("rejects POST /api/adrs/:id/move missing author with 400 naming the missing field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs/adr-9999/move",
      payload: { targetFolder: "archive" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().missingFields).toContain("author");
  });

  it("GET /api/tree returns every folder and ADR from the repository root, including an empty folder", async () => {
    await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "decisions/empty-subfolder", author: AUTHOR },
    });

    const treeRes = await app.inject({ method: "GET", url: "/api/tree" });
    expect(treeRes.statusCode).toBe(200);
    const tree = treeRes.json();

    expect(tree.path).toBe(".");
    const decisionsNode = tree.folders.find((f: { path: string }) => f.path === "decisions");
    expect(decisionsNode).toBeDefined();
    expect(decisionsNode.adrs.length).toBe(1);

    const emptySubfolder = decisionsNode.folders.find(
      (f: { path: string }) => f.path === "decisions/empty-subfolder"
    );
    expect(emptySubfolder).toBeDefined();
    expect(emptySubfolder.folders).toEqual([]);
    expect(emptySubfolder.adrs).toEqual([]);
  });

  it("GET /api/tree?root=<subfolder> returns only that subfolder's subtree", async () => {
    await app.inject({
      method: "POST",
      url: "/api/folders",
      payload: { path: "archive", author: AUTHOR },
    });
    await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });

    const treeRes = await app.inject({ method: "GET", url: "/api/tree?root=archive" });
    expect(treeRes.statusCode).toBe(200);
    const tree = treeRes.json();

    expect(tree.path).toBe("archive");
    expect(tree.adrs).toEqual([]);
    expect(tree.folders).toEqual([]);
  });

  it("serializes a concurrent ADR-create and folder-create against the shared write queue without corrupting repo state", async () => {
    const [adrRes, folderRes] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/adrs",
        payload: { title: "Concurrent ADR", folder: "decisions", author: AUTHOR },
      }),
      app.inject({
        method: "POST",
        url: "/api/folders",
        payload: { path: "concurrent-folder", author: AUTHOR },
      }),
    ]);

    expect(adrRes.statusCode).toBe(201);
    expect(folderRes.statusCode).toBe(201);

    const createdAdr = adrRes.json();
    const createdFolder = folderRes.json();
    expect(createdFolder.path).toBe("concurrent-folder");

    const treeRes = await app.inject({ method: "GET", url: "/api/tree" });
    const tree = treeRes.json();

    const decisionsNode = tree.folders.find((f: { path: string }) => f.path === "decisions");
    expect(decisionsNode.adrs.some((a: { id: string }) => a.id === createdAdr.id)).toBe(true);

    const concurrentFolderNode = tree.folders.find(
      (f: { path: string }) => f.path === "concurrent-folder"
    );
    expect(concurrentFolderNode).toBeDefined();
    expect(concurrentFolderNode.folders).toEqual([]);
    expect(concurrentFolderNode.adrs).toEqual([]);

    // The repo's commit history must show both write-queue jobs landed as
    // separate, non-overlapping commits (proving the queue genuinely
    // serialized them rather than interleaving/corrupting writes): the full
    // repo log should contain one commit per write (init + ADR create +
    // folder create = 3), each with a distinct hash.
    const fullLog = await simpleGit(repoPath).log();
    expect(fullLog.all.length).toBe(3);
    const hashes = new Set(fullLog.all.map((c) => c.hash));
    expect(hashes.size).toBe(3);
  });
});
