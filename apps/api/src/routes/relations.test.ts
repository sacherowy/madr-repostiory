import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { buildContainer, type Container } from "../container.js";
import { relationRoutes } from "./relations.js";
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

describe("relationRoutes", () => {
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
    await app.register(relationRoutes, { container });
    // PUT /api/adrs/:id is exercised here (via real HTTP) to set up relation
    // fixtures exactly as a real client would — adrRoutes itself is untouched
    // by this task and is only registered, not modified, for that purpose.
    await app.register(adrRoutes, { container });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function createAdr(title: string): Promise<{ id: string; blobSha: string }> {
    const adr = await container.adrEditing.create({ title, folder: "decisions" }, AUTHOR);
    return { id: adr.id, blobSha: adr.blobSha };
  }

  it("returns 200 and [] for an ADR with no relations at all", async () => {
    const { id } = await createAdr("Lonely ADR");

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${id}/relations`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns 404 for a nonexistent ADR id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/adrs/adr-9999/relations",
    });

    expect(res.statusCode).toBe(404);
  });

  it("shows an outbound relation an ADR declares on itself", async () => {
    const source = await createAdr("Source ADR");
    const target = await createAdr("Target ADR");

    const saveRes = await app.inject({
      method: "PUT",
      url: `/api/adrs/${source.id}`,
      payload: {
        title: "Source ADR",
        status: "accepted",
        date: "2026-01-01",
        body: "Body.",
        relations: [{ type: "relates-to", target: target.id }],
        author: AUTHOR,
        baseBlobSha: source.blobSha,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${source.id}/relations`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { type: "relates-to", target: target.id, direction: "outbound" },
    ]);
  });

  it("derives an inbound superseded-by entry when another ADR declares supersedes pointing to this one", async () => {
    const oldAdr = await createAdr("Old decision");
    const newAdr = await createAdr("New decision");

    const saveRes = await app.inject({
      method: "PUT",
      url: `/api/adrs/${newAdr.id}`,
      payload: {
        title: "New decision",
        status: "accepted",
        date: "2026-01-01",
        body: "Replaces the old decision.",
        relations: [{ type: "supersedes", target: oldAdr.id }],
        author: AUTHOR,
        baseBlobSha: newAdr.blobSha,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    // Query the OTHER (target) ADR's relations — it should show the derived
    // inbound "superseded-by" entry even though it never declared anything itself.
    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${oldAdr.id}/relations`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { type: "superseded-by", target: newAdr.id, direction: "inbound" },
    ]);
  });

  it("shows both an outbound relation it declares and an inbound relation pointing to it, together", async () => {
    const a = await createAdr("ADR A");
    const b = await createAdr("ADR B");
    const c = await createAdr("ADR C");

    // B declares an outbound relation to C.
    const saveB = await app.inject({
      method: "PUT",
      url: `/api/adrs/${b.id}`,
      payload: {
        title: "ADR B",
        status: "accepted",
        date: "2026-01-01",
        body: "Body B.",
        relations: [{ type: "depends-on", target: c.id }],
        author: AUTHOR,
        baseBlobSha: b.blobSha,
      },
    });
    expect(saveB.statusCode).toBe(200);

    // A declares supersedes pointing at B, so B should ALSO get an inbound
    // superseded-by entry, alongside its own outbound depends-on declaration.
    const saveA = await app.inject({
      method: "PUT",
      url: `/api/adrs/${a.id}`,
      payload: {
        title: "ADR A",
        status: "accepted",
        date: "2026-01-01",
        body: "Body A.",
        relations: [{ type: "supersedes", target: b.id }],
        author: AUTHOR,
        baseBlobSha: a.blobSha,
      },
    });
    expect(saveA.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${b.id}/relations`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(
      expect.arrayContaining([
        { type: "depends-on", target: c.id, direction: "outbound" },
        { type: "superseded-by", target: a.id, direction: "inbound" },
      ])
    );
    expect(res.json()).toHaveLength(2);
  });

  it("shows a symmetric relation type (depends-on) as the same type on the inbound side", async () => {
    const source = await createAdr("Depends source");
    const target = await createAdr("Depends target");

    const saveRes = await app.inject({
      method: "PUT",
      url: `/api/adrs/${source.id}`,
      payload: {
        title: "Depends source",
        status: "accepted",
        date: "2026-01-01",
        body: "Body.",
        relations: [{ type: "depends-on", target: target.id }],
        author: AUTHOR,
        baseBlobSha: source.blobSha,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    const res = await app.inject({
      method: "GET",
      url: `/api/adrs/${target.id}/relations`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { type: "depends-on", target: source.id, direction: "inbound" },
    ]);
  });
});
