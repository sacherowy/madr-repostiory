import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
import { similarityRoutes } from "./similarity.js";
import { adrRoutes } from "./adrs.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-routes-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("similarityRoutes", () => {
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

    app = Fastify();
    await app.register(similarityRoutes, { container });
    // adrRoutes is registered here (unmodified) purely to create/save real
    // ADR fixtures via real HTTP, exactly as the other route test files do.
    await app.register(adrRoutes, { container });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function createAdr(title: string, folder = "decisions"): Promise<{ id: string; blobSha: string }> {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title, folder, author: AUTHOR },
    });
    const created = res.json();
    return { id: created.id, blobSha: created.blobSha };
  }

  async function saveAdr(
    id: string,
    baseBlobSha: string,
    overrides: Partial<{ title: string; status: string; date: string; body: string }> = {}
  ): Promise<{ blobSha: string }> {
    const res = await app.inject({
      method: "PUT",
      url: `/api/adrs/${id}`,
      payload: {
        title: overrides.title ?? "Saved title",
        status: overrides.status ?? "accepted",
        date: overrides.date ?? "2026-01-01",
        body: overrides.body ?? "Saved body.",
        author: AUTHOR,
        baseBlobSha,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  /**
   * `container`'s `GeminiEmbeddingProvider` is wired with fake creds and
   * would attempt a real network call to the Gemini API on any genuine cache
   * miss. Every fixture's blob sha is pre-seeded into the real
   * `SqliteEmbeddingStore` here (the exact cache-hit path
   * `SimilarityService.vectorFor` already checks first) so `findSimilar`
   * never reaches `provider.embed` in these tests — deterministic vectors,
   * zero network I/O.
   */
  function seedVector(blobSha: string, vector: number[]): void {
    container.embeddingStore.set(blobSha, vector);
  }

  describe("GET /api/adrs/:id/similar", () => {
    it("returns 200 with a SimilarityResult[] ranking a sibling ADR in the same scope (req 10.1, 10.2)", async () => {
      const target = await createAdr("Target ADR");
      const saved = await saveAdr(target.id, target.blobSha, { body: "Target body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const sibling = await createAdr("Sibling ADR");
      const savedSibling = await saveAdr(sibling.id, sibling.blobSha, { body: "Sibling body." });
      seedVector(savedSibling.blobSha, [0.9, 0.1, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${target.id}/similar?scope=decisions`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].adr.id).toBe(sibling.id);
      expect(typeof body[0].score).toBe("number");
    });

    it("returns 200 with the literal { kind: 'emptyScope' } body (not []) when the target ADR is alone in its scope (req 10.3)", async () => {
      const alone = await createAdr("Alone ADR", "decisions/solo");
      const saved = await saveAdr(alone.id, alone.blobSha, { body: "Alone body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${alone.id}/similar?scope=decisions/solo`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ kind: "emptyScope" });
    });

    it("returns 404 for a nonexistent ADR id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-9999/similar?scope=decisions",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for a real ADR id that exists but NOT within the requested scope", async () => {
      const target = await createAdr("Out of scope ADR", "decisions");
      const saved = await saveAdr(target.id, target.blobSha, { body: "Out of scope body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${target.id}/similar?scope=decisions/empty-elsewhere`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("defaults scope to the whole repo (\".\") when the 'scope' query param is omitted entirely", async () => {
      const target = await createAdr("Default scope target");
      const saved = await saveAdr(target.id, target.blobSha, { body: "Default scope target body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const sibling = await createAdr("Default scope sibling");
      const savedSibling = await saveAdr(sibling.id, sibling.blobSha, { body: "Default scope sibling body." });
      seedVector(savedSibling.blobSha, [0.8, 0.2, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${target.id}/similar`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.some((r: { adr: { id: string } }) => r.adr.id === sibling.id)).toBe(true);
    });

    it("returns 200 (not 500) when 'scope' is supplied as a repeated query param, parsed by Fastify as an array", async () => {
      const target = await createAdr("Repeated param target");
      const saved = await saveAdr(target.id, target.blobSha, { body: "Repeated param target body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${target.id}/similar?scope=decisions&scope=other`,
      });

      expect(res.statusCode).not.toBe(500);
    });
  });
});
