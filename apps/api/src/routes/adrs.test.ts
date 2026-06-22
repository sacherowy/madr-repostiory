import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
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

describe("adrRoutes", () => {
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
    await app.register(adrRoutes, { container });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("creates an ADR and returns 201 with a generated id, then GET returns the same ADR", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.id).toMatch(/^adr-\d+$/);
    expect(created.title).toBe("Use Postgres");
    expect(created.status).toBe("proposed");
    expect(typeof created.blobSha).toBe("string");
    expect(created.blobSha.length).toBeGreaterThan(0);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}`,
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual(created);
  });

  it("rejects POST /api/adrs missing title with 400 naming the missing field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { folder: "decisions", author: AUTHOR },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().missingFields).toContain("title");
  });

  it("rejects POST /api/adrs missing author with 400 naming the missing field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().missingFields).toContain("author");
  });

  it("returns 404 for GET /api/adrs/:id when the id does not exist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/adrs/adr-9999",
    });

    expect(res.statusCode).toBe(404);
  });

  it("saves an ADR on the happy path (200) and a subsequent GET reflects the new content", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    const created = createRes.json();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/adrs/${created.id}`,
      payload: {
        title: "Use Postgres for storage",
        status: "accepted",
        date: "2026-01-01",
        body: "We will use Postgres.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      },
    });

    expect(putRes.statusCode).toBe(200);
    const saved = putRes.json();
    expect(saved.title).toBe("Use Postgres for storage");
    expect(saved.status).toBe("accepted");
    expect(saved.body).toBe("We will use Postgres.");
    expect(saved.blobSha).not.toBe(created.blobSha);

    const getRes = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}`,
    });
    expect(getRes.json()).toEqual(saved);
  });

  it("rejects PUT /api/adrs/:id missing title/body with 400 and missingFields", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    const created = createRes.json();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/adrs/${created.id}`,
      payload: {
        title: "",
        status: "accepted",
        date: "2026-01-01",
        body: "",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      },
    });

    expect(putRes.statusCode).toBe(400);
    expect(putRes.json().missingFields).toEqual(expect.arrayContaining(["title", "body"]));
  });

  it("rejects PUT /api/adrs/:id with a stale baseBlobSha with 409 and the actual latest ADR", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    const created = createRes.json();

    const firstSave = await app.inject({
      method: "PUT",
      url: `/api/adrs/${created.id}`,
      payload: {
        title: "First save",
        status: "accepted",
        date: "2026-01-01",
        body: "First body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      },
    });
    expect(firstSave.statusCode).toBe(200);
    const firstSaved = firstSave.json();

    // Reuse the now-stale original blobSha for a second save attempt.
    const staleSave = await app.inject({
      method: "PUT",
      url: `/api/adrs/${created.id}`,
      payload: {
        title: "Second save attempt",
        status: "accepted",
        date: "2026-01-02",
        body: "Second body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      },
    });

    expect(staleSave.statusCode).toBe(409);
    expect(staleSave.json().latest).toEqual(firstSaved);
  });

  it("rejects PUT /api/adrs/:id with a relation to a nonexistent target with 400 and missingTargets", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    const created = createRes.json();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/adrs/${created.id}`,
      payload: {
        title: "Use Postgres for storage",
        status: "accepted",
        date: "2026-01-01",
        body: "We will use Postgres.",
        relations: [{ type: "relates-to", target: "adr-9999" }],
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      },
    });

    expect(putRes.statusCode).toBe(400);
    expect(putRes.json().missingTargets).toEqual(["adr-9999"]);
  });

  it("returns 404 for PUT /api/adrs/:id when the id does not exist", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/adrs/adr-9999",
      payload: {
        title: "Whatever",
        status: "accepted",
        date: "2026-01-01",
        body: "Body.",
        author: AUTHOR,
        baseBlobSha: "deadbeef",
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("serializes two concurrent saves against the same ADR: one 200 and one 409, with the 409's latest matching the 200's adr exactly", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Use Postgres", folder: "decisions", author: AUTHOR },
    });
    const created = createRes.json();

    const [resA, resB] = await Promise.all([
      app.inject({
        method: "PUT",
        url: `/api/adrs/${created.id}`,
        payload: {
          title: "Save A",
          status: "accepted",
          date: "2026-01-01",
          body: "Body A.",
          author: AUTHOR,
          baseBlobSha: created.blobSha,
        },
      }),
      app.inject({
        method: "PUT",
        url: `/api/adrs/${created.id}`,
        payload: {
          title: "Save B",
          status: "accepted",
          date: "2026-01-02",
          body: "Body B.",
          author: AUTHOR,
          baseBlobSha: created.blobSha,
        },
      }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = resA.statusCode === 200 ? resA : resB;
    const loser = resA.statusCode === 409 ? resA : resB;

    expect(loser.json().latest).toEqual(winner.json());

    // The winning save's content is genuinely committed: a subsequent GET
    // matches it exactly (proving no race-corrupted intermediate state).
    const getRes = await app.inject({
      method: "GET",
      url: `/api/adrs/${created.id}`,
    });
    expect(getRes.json()).toEqual(winner.json());
  });
});
