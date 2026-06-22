import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
import { compareRoutes } from "./compare.js";
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

describe("compareRoutes", () => {
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
    await app.register(compareRoutes, { container });
    // adrRoutes is registered here (unmodified) purely to create real ADR
    // fixtures via real HTTP, exactly as relations.test.ts/history.test.ts do.
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

  describe("GET /api/compare", () => {
    it("returns 200 with an AdrCompareView containing 6 fields with correct differs flags for two distinct ADRs", async () => {
      const a = await createAdr("ADR A title");
      const b = await createAdr("ADR B title");

      // Make both ADRs share the same status/date but differ in title/body,
      // so we can assert both differs:true and differs:false outcomes.
      await saveAdr(a.id, a.blobSha, {
        title: "ADR A title",
        status: "accepted",
        date: "2026-01-01",
        body: "Body A.",
      });
      await saveAdr(b.id, b.blobSha, {
        title: "ADR B title",
        status: "accepted",
        date: "2026-01-01",
        body: "Body B.",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?a=${a.id}&b=${b.id}`,
      });

      expect(res.statusCode).toBe(200);
      const view = res.json();
      expect(view.a.id).toBe(a.id);
      expect(view.b.id).toBe(b.id);
      expect(view.fields).toHaveLength(6);

      const byField = (name: string) => view.fields.find((f: { field: string }) => f.field === name);
      expect(byField("title").differs).toBe(true);
      expect(byField("body").differs).toBe(true);
      // status and date were set identically on both ADRs.
      expect(byField("status").differs).toBe(false);
      expect(byField("date").differs).toBe(false);
    });

    it("includes at least one field with differs:false when some fields are identical (requirement 8.2)", async () => {
      const a = await createAdr("Same status ADR A");
      const b = await createAdr("Same status ADR B");

      await saveAdr(a.id, a.blobSha, { title: "Same status ADR A", status: "proposed", date: "2026-02-02" });
      await saveAdr(b.id, b.blobSha, { title: "Same status ADR B", status: "proposed", date: "2026-02-02" });

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?a=${a.id}&b=${b.id}`,
      });

      expect(res.statusCode).toBe(200);
      const view = res.json();
      const identicalFields = view.fields.filter((f: { differs: boolean }) => f.differs === false);
      expect(identicalFields.length).toBeGreaterThan(0);
      const status = view.fields.find((f: { field: string }) => f.field === "status");
      expect(status).toEqual({ field: "status", a: "proposed", b: "proposed", differs: false });
    });

    it("returns 400 when comparing an ADR against itself (requirement 8.3)", async () => {
      const a = await createAdr("Self compare ADR");

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?a=${a.id}&b=${a.id}`,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 when 'a' does not resolve to a real ADR", async () => {
      const b = await createAdr("Real ADR B");

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?a=adr-9999&b=${b.id}`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 when 'b' does not resolve to a real ADR", async () => {
      const a = await createAdr("Real ADR A");

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?a=${a.id}&b=adr-9999`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 404 when neither 'a' nor 'b' resolve to a real ADR", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/compare?a=adr-1111&b=adr-2222",
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 400 when 'a' query param is missing entirely", async () => {
      const b = await createAdr("Missing a param");

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?b=${b.id}`,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when 'b' query param is missing entirely", async () => {
      const a = await createAdr("Missing b param");

      const res = await app.inject({
        method: "GET",
        url: `/api/compare?a=${a.id}`,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when both 'a' and 'b' query params are missing entirely", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/compare",
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 400 (not 404) when both 'a' and 'b' are equal but empty/bogus", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/compare?a=adr-same&b=adr-same",
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
