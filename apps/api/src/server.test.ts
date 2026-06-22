import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { buildContainer, type Container } from "./container.js";
import { buildServer } from "./server.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-server-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("buildServer", () => {
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

    // Seed an initial commit so listAdrFiles/log have a HEAD to scan against.
    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);

    app = await buildServer(container);
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function createAdr(title: string): Promise<{ id: string; blobSha: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title, folder: "decisions", author: AUTHOR },
    });
    return res.json();
  }

  it("still serves GET /health with its original response shape", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      status: "ok",
      sourceOfTruth: "git",
      repo: body.repo,
    });
    expect(typeof body.repo).toBe("string");
  });

  it("returns 404 for a genuinely unmatched route (control case)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/does-not-exist" });

    expect(res.statusCode).toBe(404);
  });

  it("wires adrRoutes: POST /api/adrs returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "A new ADR", folder: "decisions", author: AUTHOR },
    });

    expect(res.statusCode).toBe(201);
  });

  it("wires relationRoutes: GET /api/adrs/:id/relations returns 200 + []", async () => {
    const created = await createAdr("Relation target ADR");

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}/relations`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("wires folderRoutes: GET /api/tree returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tree" });

    expect(res.statusCode).toBe(200);
  });

  it("wires historyRoutes: GET /api/adrs/:id/history returns 200", async () => {
    const created = await createAdr("History target ADR");

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}/history`,
    });

    expect(res.statusCode).toBe(200);
  });

  it("wires compareRoutes: GET /api/compare without a/b returns 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/compare" });

    expect(res.statusCode).toBe(400);
  });

  it("wires searchRoutes: GET /api/search?q=anything returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search?q=anything" });

    expect(res.statusCode).toBe(200);
  });

  it("wires similarityRoutes: GET /api/adrs/:id/similar returns 200 + emptyScope", async () => {
    const created = await createAdr("Alone in scope ADR");

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}/similar`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kind: "emptyScope" });
  });
});
