import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import {
  SimilarityProviderError,
  type FindSimilarOptions,
  type SimilarityFindResult,
  type SimilarityFinder,
  type SimilarityProviderFailure,
} from "@adr/core";
import type { SimilarityResult } from "@adr/shared";
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
    overrides: Partial<{
      title: string;
      status: string;
      date: string;
      contextAndProblemStatement: string;
    }> = {}
  ): Promise<{ blobSha: string }> {
    const res = await app.inject({
      method: "PUT",
      url: `/api/adrs/${id}`,
      payload: {
        title: overrides.title ?? "Saved title",
        status: overrides.status ?? "accepted",
        date: overrides.date ?? "2026-01-01",
        contextAndProblemStatement: overrides.contextAndProblemStatement ?? "Saved body.",
        decisionOutcome: "Saved outcome.",
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
      const saved = await saveAdr(target.id, target.blobSha, { contextAndProblemStatement: "Target body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const sibling = await createAdr("Sibling ADR");
      const savedSibling = await saveAdr(sibling.id, sibling.blobSha, { contextAndProblemStatement: "Sibling body." });
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
      const saved = await saveAdr(alone.id, alone.blobSha, { contextAndProblemStatement: "Alone body." });
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
      const saved = await saveAdr(target.id, target.blobSha, { contextAndProblemStatement: "Out of scope body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${target.id}/similar?scope=decisions/empty-elsewhere`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("defaults scope to the whole repo (\".\") when the 'scope' query param is omitted entirely", async () => {
      const target = await createAdr("Default scope target");
      const saved = await saveAdr(target.id, target.blobSha, { contextAndProblemStatement: "Default scope target body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const sibling = await createAdr("Default scope sibling");
      const savedSibling = await saveAdr(sibling.id, sibling.blobSha, { contextAndProblemStatement: "Default scope sibling body." });
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
      const saved = await saveAdr(target.id, target.blobSha, { contextAndProblemStatement: "Repeated param target body." });
      seedVector(saved.blobSha, [1, 0, 0]);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${target.id}/similar?scope=decisions&scope=other`,
      });

      expect(res.statusCode).not.toBe(500);
    });
  });
});

/**
 * Route-level contract tests with a substitute `SimilarityFinder` (no git, no
 * provider): they pin how the route maps finder outcomes to HTTP — the
 * `exhaustive` query option, the coverage headers, 503 for the typed provider
 * failure, 404 for everything else — and what it logs (design.md
 * "Server entrypoint, health and similarity route", Error Handling).
 */
describe("similarityRoutes with a substitute finder", () => {
  interface Call {
    id: string;
    scopePath: string;
    options: FindSimilarOptions | undefined;
  }

  let calls: Call[];
  let logLines: Array<Record<string, unknown>>;
  let outcome: () => Promise<SimilarityFindResult>;
  let app: FastifyInstance;

  const RESULTS: SimilarityResult[] = [
    {
      adr: {
        id: "adr-0002",
        path: "org/platform/adr-0002-queue.md",
        title: "Use a queue",
        status: "accepted",
        date: "2026-01-01",
        contextAndProblemStatement: "Context.",
        decisionOutcome: "Outcome.",
      } as unknown as SimilarityResult["adr"],
      score: 0.92,
      lineage: { direction: "up", level: 1 },
      relation: "supersedes",
    },
  ];

  beforeEach(async () => {
    calls = [];
    logLines = [];
    outcome = async () => ({ kind: "ranked", results: RESULTS });

    const finder: SimilarityFinder = {
      findSimilar: (id, scopePath, options) => {
        calls.push({ id, scopePath, options });
        return outcome();
      },
    };
    const container = { similarity: finder } as unknown as Container;

    const stream = new Writable({
      write(chunk, _enc, cb) {
        for (const line of String(chunk).split("\n")) {
          if (line.trim().length > 0) logLines.push(JSON.parse(line));
        }
        cb();
      },
    });

    app = Fastify({ logger: { level: "info", stream } });
    await app.register(similarityRoutes, { container });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (query = "") => app.inject({ method: "GET", url: `/api/adrs/adr-0001/similar${query}` });
  const warnLines = () => logLines.filter((l) => l.level === 40);
  const infoWith = (key: string) => logLines.filter((l) => l.level === 30 && key in l);

  const CATEGORIES: SimilarityProviderFailure[] = ["network", "timeout", "http-status", "invalid-response", "budget"];

  for (const category of CATEGORIES) {
    it(`maps a SimilarityProviderError("${category}") to 503 { kind: "providerUnavailable" } (7.1, 7.6)`, async () => {
      const httpStatus = category === "http-status" ? 429 : null;
      outcome = async () => {
        throw new SimilarityProviderError(category, httpStatus, `jev ${category}`);
      };

      const res = await get();

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ kind: "providerUnavailable" });
    });
  }

  it("logs one warn line with only the category and HTTP status on a provider failure (7.5)", async () => {
    outcome = async () => {
      throw new SimilarityProviderError("http-status", 401, "Jev answered 401 SECRET-ADR-TEXT");
    };

    await get();

    const warns = warnLines();
    expect(warns).toHaveLength(1);
    expect(warns[0].category).toBe("http-status");
    expect(warns[0].httpStatus).toBe(401);
    expect(warns[0].msg).toBe("similarity provider unavailable");
    expect(JSON.stringify(warns[0])).not.toContain("SECRET-ADR-TEXT");
    expect(warns[0]).not.toHaveProperty("err");
  });

  it("maps a plain Error to an empty 404 and logs no provider warning (5.4)", async () => {
    outcome = async () => {
      throw new Error("ADR not found");
    };

    const res = await get();

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe("");
    expect(warnLines().filter((l) => l.msg === "similarity provider unavailable")).toHaveLength(0);
  });

  it("passes lineage and relation through in the body unchanged (5.1)", async () => {
    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(RESULTS);
  });

  it("still sends the literal emptyScope object", async () => {
    outcome = async () => ({ kind: "emptyScope" });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ kind: "emptyScope" });
    expect(res.headers["x-similarity-judged"]).toBeUndefined();
    expect(res.headers["x-similarity-candidates"]).toBeUndefined();
  });

  const EXHAUSTIVE_CASES: Array<[string, boolean]> = [
    ["", false],
    ["?exhaustive=true", true],
    ["?exhaustive=false", false],
    ["?exhaustive=TRUE", false],
    ["?exhaustive=1", false],
    ["?exhaustive=", false],
    ["?exhaustive=true&exhaustive=false", true],
    ["?exhaustive=false&exhaustive=true", false],
  ];

  for (const [query, expected] of EXHAUSTIVE_CASES) {
    it(`passes { exhaustive: ${expected} } for "${query || "(absent)"}" (4.9)`, async () => {
      await get(query);

      expect(calls).toHaveLength(1);
      expect(calls[0].options).toEqual({ exhaustive: expected });
    });
  }

  it("keeps scope handling unchanged alongside exhaustive (default '.', first value of a repeated key)", async () => {
    await get("?exhaustive=true");
    await get("?scope=org/platform&scope=other&exhaustive=true");

    expect(calls.map((c) => [c.id, c.scopePath])).toEqual([
      ["adr-0001", "."],
      ["adr-0001", "org/platform"],
    ]);
  });

  it("sets both X-Similarity-* headers for a ranked result with coverage, with an identical body (5.6, 5.1)", async () => {
    const plain = await get();
    outcome = async () => ({ kind: "ranked", results: RESULTS, coverage: { judged: 100, total: 150 } });

    const res = await get();

    expect(res.statusCode).toBe(200);
    expect(res.headers["x-similarity-judged"]).toBe("100");
    expect(res.headers["x-similarity-candidates"]).toBe("150");
    expect(res.body).toBe(plain.body);
  });

  it("sets no X-Similarity-* headers when the ranked result has no coverage (5.7)", async () => {
    const res = await get("?exhaustive=true");

    expect(res.headers["x-similarity-judged"]).toBeUndefined();
    expect(res.headers["x-similarity-candidates"]).toBeUndefined();
  });

  it("logs judged and total once for an exhaustive request (Monitoring)", async () => {
    outcome = async () => ({ kind: "ranked", results: RESULTS, coverage: { judged: 150, total: 150 } });

    await get("?exhaustive=true");

    const lines = infoWith("judged");
    expect(lines).toHaveLength(1);
    expect(lines[0].judged).toBe(150);
    expect(lines[0].total).toBe(150);
  });

  it("does not log judged/total for a capped request", async () => {
    outcome = async () => ({ kind: "ranked", results: RESULTS, coverage: { judged: 100, total: 150 } });

    await get();

    expect(infoWith("judged")).toHaveLength(0);
  });
});
