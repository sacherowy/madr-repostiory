import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
import { searchRoutes } from "./search.js";
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

describe("searchRoutes", () => {
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
    await container.git.writeAndCommit(
      "decisions/.gitkeep",
      "",
      "init repo",
      AUTHOR
    );

    app = Fastify();
    await app.register(searchRoutes, { container });
    // adrRoutes is registered here (unmodified) purely to create real ADR
    // fixtures via real HTTP, exactly as relations.test.ts/history.test.ts/
    // compare.test.ts do for their own fixtures. Indexing only happens on
    // save() (PUT), not create() (POST), so fixtures must go through both.
    await app.register(adrRoutes, { container });
    await app.ready();
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
    const created = res.json();
    return { id: created.id, blobSha: created.blobSha };
  }

  async function saveAdr(
    id: string,
    baseBlobSha: string,
    overrides: Partial<{ title: string; status: string; date: string; body: string; tags: string[] }> = {}
  ): Promise<{ blobSha: string }> {
    const res = await app.inject({
      method: "PUT",
      url: `/api/adrs/${id}`,
      payload: {
        title: overrides.title ?? "Saved title",
        status: overrides.status ?? "accepted",
        date: overrides.date ?? "2026-01-01",
        body: overrides.body ?? "Saved body.",
        tags: overrides.tags,
        author: AUTHOR,
        baseBlobSha,
      },
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  describe("GET /api/search", () => {
    it("returns 200 with a SearchHit[] containing the matching ADR's id for a term in its title/body (req 9.1)", async () => {
      const a = await createAdr("Bespoke widget rendering");
      await saveAdr(a.id, a.blobSha, {
        title: "Bespoke widget rendering",
        body: "Discusses how widgets are rendered.",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/search?q=widget",
      });

      expect(res.statusCode).toBe(200);
      const hits = res.json();
      expect(Array.isArray(hits)).toBe(true);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((hit: { id: string }) => hit.id === a.id)).toBe(true);
    });

    it("returns 200 with an empty array (not an error) when no ADR matches the term (req 9.3)", async () => {
      const a = await createAdr("Completely unrelated topic");
      await saveAdr(a.id, a.blobSha, {
        title: "Completely unrelated topic",
        body: "Nothing to do with the search term at all.",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/search?q=zzznonexistentzzz",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns 200 with an empty array when the 'q' query param is missing entirely (no validation, no error)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/search",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("ranks a title match ahead of a body-only match for the same term (req 9.2)", async () => {
      const bodyMatch = await createAdr("First ADR");
      await saveAdr(bodyMatch.id, bodyMatch.blobSha, {
        title: "First ADR",
        body: "This decision concerns the quasar subsystem in passing.",
      });

      const titleMatch = await createAdr("Quasar subsystem redesign");
      await saveAdr(titleMatch.id, titleMatch.blobSha, {
        title: "Quasar subsystem redesign",
        body: "Unrelated body content here.",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/search?q=quasar",
      });

      expect(res.statusCode).toBe(200);
      const hits = res.json();
      expect(hits.length).toBe(2);
      expect(hits[0].id).toBe(titleMatch.id);
      expect(hits[1].id).toBe(bodyMatch.id);
    });

    it("matches an ADR by a tag, not just title/body content (req 9.1)", async () => {
      const a = await createAdr("Tagged ADR");
      await saveAdr(a.id, a.blobSha, {
        title: "Tagged ADR",
        body: "Body text with no overlap with the search term.",
        tags: ["zephyr"],
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/search?q=zephyr",
      });

      expect(res.statusCode).toBe(200);
      const hits = res.json();
      expect(hits.some((hit: { id: string }) => hit.id === a.id)).toBe(true);
    });

    it("returns 200 (not 500) when 'q' is supplied as a repeated query param, parsed by Fastify as an array", async () => {
      const a = await createAdr("Repeated param ADR");
      await saveAdr(a.id, a.blobSha, {
        title: "Repeated param ADR",
        body: "Discusses a gizmo at length.",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/search?q=gizmo&q=other",
      });

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json())).toBe(true);
    });
  });
});
