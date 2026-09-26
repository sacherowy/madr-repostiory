import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { buildContainer, type Container, type ContainerConfig } from "./container.js";
import { buildServer, containerFromConfig } from "./server.js";
import { parseSimilarityConfig } from "./similarityConfig.js";

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

  it("serves GET /health with its original fields plus the active similarity strategy (5.5)", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      status: "ok",
      sourceOfTruth: "git",
      repo: body.repo,
      similarity: { strategy: "embedding" },
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

  it("wires feedRoutes: GET /api/feed returns 200 with an array", async () => {
    await createAdr("Feed wiring ADR");

    const res = await app.inject({ method: "GET", url: "/api/feed" });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json()).toHaveLength(1);
  });

  it("wires the raw route: GET /api/adrs/:id/raw returns 200 with path and markdown", async () => {
    const created = await createAdr("Raw wiring ADR");

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}/raw`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.path).toBe("string");
    expect(typeof body.markdown).toBe("string");
  });

  it("wires summariesRoutes: GET /api/adrs/:id/summary-suggestion returns 200 (cache pre-seeded, no network)", async () => {
    const created = await createAdr("Suggestion wiring ADR");
    // Pre-seed the real summary cache with this revision's blob SHA so the
    // route resolves as a cache hit — the fake-key GeminiSummaryProvider is
    // never reached, keeping this test offline.
    container.summaryStore.set(created.blobSha, "Cached wiring sentence.");

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}/summary-suggestion`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      available: true,
      suggestion: "Cached wiring sentence.",
    });
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

describe("GET /health under the jev strategy", () => {
  const JEV_KEY = "health-secret-jev-key";
  const JEV_ENDPOINT = "http://127.0.0.1:4010/decisions";
  let repoPath: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    repoPath = await initRepo();
    const result = parseSimilarityConfig({
      SIMILARITY_STRATEGY: "jev",
      JEV_ENDPOINT,
      JEV_API_KEY: JEV_KEY,
      JEV_MODEL: "typesafe/jev-health-test",
    });
    if (!result.ok) throw new Error("expected a valid jev config");
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
      similarity: result.config,
    });
    app = await buildServer(container);
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("reports the strategy name read from the container and no Jev values (5.5, 2.7)", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.similarity).toEqual({ strategy: "jev" });
    expect(Object.keys(body).sort()).toEqual(["repo", "similarity", "sourceOfTruth", "status"]);
    expect(res.body).not.toContain(JEV_KEY);
    expect(res.body).not.toContain("127.0.0.1:4010");
    expect(res.body).not.toContain("jev-health-test");
  });
});

describe("containerFromConfig (startup configuration gate)", () => {
  const base: ContainerConfig = {
    repoPath: "/unused/repo",
    sqlitePath: "/unused/index.sqlite",
    gemini: { model: "fake-model", apiKey: "fake-key" },
  };

  class ExitCalled extends Error {
    constructor(readonly code: number) {
      super(`exit ${code}`);
    }
  }

  function stubs() {
    const writes: string[] = [];
    const stderr = { write: vi.fn((chunk: string) => (writes.push(chunk), true)) };
    const exit = vi.fn((code: number): never => {
      throw new ExitCalled(code);
    });
    const build = vi.fn((_cfg: ContainerConfig) => ({ similarityStrategy: "embedding" }) as unknown as Container);
    return { writes, stderr, exit, build };
  }

  it("writes one aggregated message to stderr, exits 1 and builds no container on an invalid configuration (2.1, 2.6, 2.7)", () => {
    const secret = "gate-secret-key-value";
    const result = parseSimilarityConfig({
      SIMILARITY_STRATEGY: "jev",
      JEV_ENDPOINT: "http://api.example.com/decisions",
      JEV_API_KEY: secret,
      JEV_TIMEOUT_MS: "0",
      JEV_CONCURRENCY: "abc",
    });
    expect(result.ok).toBe(false);
    const { writes, stderr, exit, build } = stubs();

    expect(() => containerFromConfig(base, result, { stderr, exit, build })).toThrow(ExitCalled);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(build).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledTimes(1);
    const message = writes[0];
    expect(message).toContain("JEV_ENDPOINT");
    expect(message).toContain("JEV_TIMEOUT_MS");
    expect(message).toContain("JEV_CONCURRENCY");
    expect(message).not.toContain(secret);
  });

  it("reports an unknown strategy value in the aggregated message (2.1)", () => {
    const result = parseSimilarityConfig({ SIMILARITY_STRATEGY: "cosine-magic" });
    const { writes, stderr, exit, build } = stubs();

    expect(() => containerFromConfig(base, result, { stderr, exit, build })).toThrow(ExitCalled);

    expect(exit).toHaveBeenCalledWith(1);
    expect(build).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("SIMILARITY_STRATEGY");
    expect(writes[0]).toContain("cosine-magic");
  });

  it("builds the container with the validated similarity configuration when the parse succeeded (1.5)", () => {
    const result = parseSimilarityConfig({
      SIMILARITY_STRATEGY: "jev",
      JEV_ENDPOINT: "http://127.0.0.1:4010/decisions",
      JEV_API_KEY: "ok-key",
    });
    if (!result.ok) throw new Error("expected a valid jev config");
    const { stderr, exit, build } = stubs();

    const container = containerFromConfig(base, result, { stderr, exit, build });

    expect(exit).not.toHaveBeenCalled();
    expect(stderr.write).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith({ ...base, similarity: result.config });
    expect(container).toBe(build.mock.results[0]!.value);
  });

  it("passes the embedding configuration through when the strategy is unset (1.5)", () => {
    const result = parseSimilarityConfig({});
    const { stderr, exit, build } = stubs();

    containerFromConfig(base, result, { stderr, exit, build });

    expect(build).toHaveBeenCalledWith({ ...base, similarity: { strategy: "embedding" } });
    expect(exit).not.toHaveBeenCalled();
  });
});
