import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
import { historyRoutes } from "./history.js";
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

describe("historyRoutes", () => {
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
    await app.register(historyRoutes, { container });
    // adrRoutes is registered here (unmodified) purely to create/save ADR
    // fixtures through real HTTP, exactly as relations.test.ts does.
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

  describe("GET /api/adrs/:id/history", () => {
    it("returns 200 with an array of length 1 for an ADR with exactly one saved version", async () => {
      const { id } = await createAdr("Single version ADR");

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/history`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
    });

    it("returns commits newest-first for an ADR saved multiple times", async () => {
      const { id, blobSha } = await createAdr("Multi version ADR");
      await saveAdr(id, blobSha, {
        title: "Multi version ADR",
        contextAndProblemStatement: "Updated body.",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/history`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      // Newest first: the most recent commit's message matches the save
      // ("save <id>"), not the create ("create <id>").
      expect(body[0].message).toBe(`save ${id}`);
      expect(body[1].message).toBe(`create ${id}`);
    });

    it("returns 404 for a nonexistent ADR id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-9999/history",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/adrs/:id/versions/:sha", () => {
    it("returns 200 with the ADR's content AS IT EXISTED at a real historical sha, not its latest content", async () => {
      const { id, blobSha } = await createAdr("Versioned ADR");
      await saveAdr(id, blobSha, {
        title: "Versioned ADR (updated)",
        contextAndProblemStatement: "Updated body content.",
      });

      const historyRes = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/history`,
      });
      const history = historyRes.json();
      // Oldest entry (the create) is last in newest-first order.
      const firstSha = history[history.length - 1].sha;

      const versionRes = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/versions/${firstSha}`,
      });

      expect(versionRes.statusCode).toBe(200);
      const version = versionRes.json();
      // The original (pre-save) content, not the updated content.
      expect(version.contextAndProblemStatement).not.toBe("Updated body content.");
      expect(version.title).toBe("Versioned ADR");
    });

    it("returns 404 for a nonexistent ADR id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-9999/versions/deadbeef",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 for a real ADR id but a bogus sha", async () => {
      const { id } = await createAdr("Has bogus sha lookup");

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/versions/0000000000000000000000000000000000000000`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/adrs/:id/diff", () => {
    it("returns 200 with a VersionDiffView showing real added/removed hunks between two versions of the same ADR", async () => {
      const { id, blobSha } = await createAdr("Diffed ADR");
      await saveAdr(id, blobSha, {
        title: "Diffed ADR",
        contextAndProblemStatement: "Completely different body content.",
      });

      const historyRes = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/history`,
      });
      const history = historyRes.json();
      const createSha = history[history.length - 1].sha;
      const saveSha = history[0].sha;
      expect(history[0].message).toBe(`save ${id}`);

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/diff?from=${createSha}&to=${saveSha}`,
      });

      expect(res.statusCode).toBe(200);
      const view = res.json();
      expect(view.hunks).toBeDefined();
      const hasRealChange = view.hunks.some(
        (h: { kind: string }) => h.kind === "added" || h.kind === "removed"
      );
      expect(hasRealChange).toBe(true);
    });

    it("returns 400 when 'from' query param is missing", async () => {
      const { id } = await createAdr("Missing from param");

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/diff?to=deadbeef`,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when 'to' query param is missing", async () => {
      const { id } = await createAdr("Missing to param");

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${id}/diff?from=deadbeef`,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 (not 400) for a nonexistent ADR id", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-9999/diff?from=deadbeef&to=beadfeed",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when from/to belong to two different ADRs (rejection rather than a diff)", async () => {
      const a = await createAdr("ADR A for cross-diff");
      const b = await createAdr("ADR B for cross-diff");

      const aHistoryRes = await app.inject({
        method: "GET",
        url: `/api/adrs/${a.id}/history`,
      });
      const aSha = aHistoryRes.json()[0].sha;

      const bHistoryRes = await app.inject({
        method: "GET",
        url: `/api/adrs/${b.id}/history`,
      });
      const bSha = bHistoryRes.json()[0].sha;

      const res = await app.inject({
        method: "GET",
        url: `/api/adrs/${a.id}/diff?from=${aSha}&to=${bSha}`,
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
