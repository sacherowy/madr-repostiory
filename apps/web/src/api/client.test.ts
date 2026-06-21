import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// `@adr/api` has no `main`/`exports` field (it's an app entrypoint, not a
// library), so it can't be imported via the bare `@adr/api` specifier the
// way `@adr/core`/`@adr/shared` are. It's still declared as a `workspace:*`
// devDependency in package.json (test-only, never shipped to the browser
// bundle) and is reached here via a relative path into its `src/`, which a
// pnpm workspace resolves identically to any other relative import.
import { buildContainer, type Container } from "../../../api/src/container.js";
import { buildServer } from "../../../api/src/server.js";
import { createApiClient, type ApiClient } from "./client.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-client-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("createApiClient", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

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
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * `container`'s `GeminiEmbeddingProvider` is wired with fake creds and
   * would attempt a real network call to the Gemini API on any genuine
   * cache miss. Every fixture's blob sha is pre-seeded into the real
   * `SqliteEmbeddingStore` here (mirrors the `seedVector` pattern in
   * apps/api/src/routes/similarity.test.ts) so similarity calls in this
   * file never reach `provider.embed` — deterministic vectors, zero
   * network I/O.
   */
  function seedVector(blobSha: string, vector: number[]): void {
    container.embeddingStore.set(blobSha, vector);
  }

  async function createAdrViaClient(title: string, folder = "decisions") {
    const result = await client.createAdr({ title, folder, author: AUTHOR });
    if (!result.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    return result.adr;
  }

  describe("createAdr (POST /api/adrs)", () => {
    it("returns ok:true with a typed Adr on success", async () => {
      const result = await client.createAdr({ title: "A new ADR", folder: "decisions", author: AUTHOR });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.adr.title).toBe("A new ADR");
      expect(typeof result.adr.id).toBe("string");
      expect(typeof result.adr.blobSha).toBe("string");
    });

    it("returns ok:false with missingFields on a 400", async () => {
      const result = await client.createAdr({ title: "", folder: "", author: "" });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(400);
      expect(result.missingFields).toEqual(expect.arrayContaining(["title", "folder", "author"]));
    });
  });

  describe("getAdr (GET /api/adrs/:id)", () => {
    it("returns ok:true with the Adr on success", async () => {
      const created = await createAdrViaClient("Gettable ADR");

      const result = await client.getAdr(created.id);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.adr.id).toBe(created.id);
    });

    it("returns ok:false with status 404 for an unknown id", async () => {
      const result = await client.getAdr("adr-9999");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("updateAdr (PUT /api/adrs/:id)", () => {
    it("returns ok:true with the saved Adr on success", async () => {
      const created = await createAdrViaClient("Updatable ADR");

      const result = await client.updateAdr(created.id, {
        title: "Updated title",
        status: "accepted",
        date: "2026-01-01",
        body: "Updated body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.adr.title).toBe("Updated title");
      expect(result.adr.status).toBe("accepted");
    });

    it("returns a conflict result exposing typed `latest` on a 409", async () => {
      const created = await createAdrViaClient("Conflict ADR");

      // First save succeeds and advances the blob sha.
      const first = await client.updateAdr(created.id, {
        title: "First save",
        status: "accepted",
        date: "2026-01-01",
        body: "First body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      });
      expect(first.ok).toBe(true);

      // Second save reuses the now-stale base sha.
      const result = await client.updateAdr(created.id, {
        title: "Second save",
        status: "accepted",
        date: "2026-01-01",
        body: "Second body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "conflict") throw new Error(`expected conflict, got ${result.kind}`);
      expect(result.status).toBe(409);
      expect(result.latest.title).toBe("First save");
    });

    it("returns a missingFields result on a 400 for empty title/body", async () => {
      const created = await createAdrViaClient("Invalid save ADR");

      const result = await client.updateAdr(created.id, {
        title: "",
        status: "accepted",
        date: "2026-01-01",
        body: "",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "invalid") throw new Error(`expected invalid, got ${result.kind}`);
      expect(result.missingFields).toEqual(expect.arrayContaining(["title", "body"]));
    });

    it("returns a missingTargets result on a 400 for a nonexistent relation target", async () => {
      const created = await createAdrViaClient("Bad relation ADR");

      const result = await client.updateAdr(created.id, {
        title: "Has bad relation",
        status: "accepted",
        date: "2026-01-01",
        body: "Body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
        relations: [{ type: "relates-to", target: "adr-9999" }],
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "invalidRelations") throw new Error(`expected invalidRelations, got ${result.kind}`);
      expect(result.missingTargets).toEqual(["adr-9999"]);
    });

    it("returns ok:false with status 404 for an unknown id", async () => {
      const result = await client.updateAdr("adr-9999", {
        title: "Whatever",
        status: "accepted",
        date: "2026-01-01",
        body: "Whatever body.",
        author: AUTHOR,
        baseBlobSha: "deadbeef",
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("getRelations (GET /api/adrs/:id/relations)", () => {
    it("returns ok:true with a typed RelationView[] (declared + reciprocal)", async () => {
      const target = await createAdrViaClient("Relation target");
      const source = await createAdrViaClient("Relation source");

      await client.updateAdr(source.id, {
        title: "Relation source",
        status: "accepted",
        date: "2026-01-01",
        body: "Source body.",
        author: AUTHOR,
        baseBlobSha: source.blobSha,
        relations: [{ type: "supersedes", target: target.id }],
      });

      const result = await client.getRelations(target.id);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0]).toEqual({
        type: "superseded-by",
        target: source.id,
        direction: "inbound",
      });
    });

    it("returns ok:false with status 404 for an unknown id", async () => {
      const result = await client.getRelations("adr-9999");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("createFolder (POST /api/folders)", () => {
    it("returns ok:true with a typed FolderNode on success", async () => {
      const result = await client.createFolder({ path: "decisions/new-folder", author: AUTHOR });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.node.path).toBe("decisions/new-folder");
    });

    it("returns a missingFields result on a 400", async () => {
      const result = await client.createFolder({ path: "", author: "" });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "invalid") throw new Error(`expected invalid, got ${result.kind}`);
      expect(result.missingFields).toEqual(expect.arrayContaining(["path", "author"]));
    });

    it("returns ok:false with status 409 when the folder already exists", async () => {
      await client.createFolder({ path: "decisions/dup-folder", author: AUTHOR });

      const result = await client.createFolder({ path: "decisions/dup-folder", author: AUTHOR });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "conflict") throw new Error(`expected conflict, got ${result.kind}`);
      expect(result.status).toBe(409);
    });
  });

  describe("moveAdr (POST /api/adrs/:id/move)", () => {
    it("returns ok:true with the moved Adr on success", async () => {
      const created = await createAdrViaClient("Movable ADR");

      const result = await client.moveAdr(created.id, { targetFolder: "decisions/moved-here", author: AUTHOR });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.adr.id).toBe(created.id);
      expect(result.adr.path.startsWith("decisions/moved-here/")).toBe(true);
    });

    it("returns a missingFields result on a 400", async () => {
      const created = await createAdrViaClient("Bad move ADR");

      const result = await client.moveAdr(created.id, { targetFolder: "", author: "" });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "invalid") throw new Error(`expected invalid, got ${result.kind}`);
      expect(result.missingFields).toEqual(expect.arrayContaining(["targetFolder", "author"]));
    });

    it("returns ok:false with status 404 for an unknown id", async () => {
      const result = await client.moveAdr("adr-9999", { targetFolder: "decisions/x", author: AUTHOR });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("getTree (GET /api/tree)", () => {
    it("returns ok:true with a typed FolderNode for the repo root", async () => {
      await createAdrViaClient("Tree ADR");

      const result = await client.getTree();

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.tree.path).toBeDefined();
      expect(Array.isArray(result.tree.folders)).toBe(true);
      expect(Array.isArray(result.tree.adrs)).toBe(true);
    });

    it("accepts a root parameter and returns a scoped FolderNode", async () => {
      await client.createFolder({ path: "decisions/scoped", author: AUTHOR });

      const result = await client.getTree("decisions/scoped");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.tree.path).toBe("decisions/scoped");
    });
  });

  describe("getHistory (GET /api/adrs/:id/history)", () => {
    it("returns ok:true with a typed CommitMeta[]", async () => {
      const created = await createAdrViaClient("History ADR");

      const result = await client.getHistory(created.id);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.history.length).toBeGreaterThanOrEqual(1);
      expect(typeof result.history[0].sha).toBe("string");
      expect(typeof result.history[0].message).toBe("string");
    });

    it("returns ok:false with status 404 for an unknown id", async () => {
      const result = await client.getHistory("adr-9999");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("getVersionAt (GET /api/adrs/:id/versions/:sha)", () => {
    it("returns ok:true with the Adr content as of that version", async () => {
      const created = await createAdrViaClient("Versioned ADR");
      // `versionAt`'s `sha` parameter is a *commit* sha (per
      // HistoryService.versionAt's doc comment), not the blob sha returned
      // by create/update — fetch the real commit sha from history first.
      const history = await client.getHistory(created.id);
      if (!history.ok) throw new Error("fixture setup: getHistory unexpectedly failed");
      const commitSha = history.history[0].sha;

      const result = await client.getVersionAt(created.id, commitSha);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.adr.id).toBe(created.id);
    });

    it("returns ok:false with status 404 for an unknown sha", async () => {
      const created = await createAdrViaClient("Versioned ADR 404");

      const result = await client.getVersionAt(created.id, "0000000000000000000000000000000000000000");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("getVersionDiff (GET /api/adrs/:id/diff)", () => {
    it("returns ok:true with a typed VersionDiffView between two versions", async () => {
      const created = await createAdrViaClient("Diffable ADR");
      const saved = await client.updateAdr(created.id, {
        title: "Diffable ADR",
        status: "accepted",
        date: "2026-01-01",
        body: "Second version body.",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: save unexpectedly failed");
      // `versionDiff`'s `from`/`to` are *commit* shas (same as
      // `versionAt`'s), so fetch the real commit history rather than reusing
      // the blob shas returned by create/update.
      const history = await client.getHistory(created.id);
      if (!history.ok) throw new Error("fixture setup: getHistory unexpectedly failed");
      const [latestCommit, firstCommit] = history.history;

      const result = await client.getVersionDiff(created.id, firstCommit.sha, latestCommit.sha);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(Array.isArray(result.diff.hunks)).toBe(true);
    });

    it("returns ok:false with status 404 for an unknown ADR id", async () => {
      const result = await client.getVersionDiff("adr-9999", "a", "b");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });

    it("returns ok:false with a typed reason on a 400 for a missing from/to", async () => {
      const created = await createAdrViaClient("Bad diff ADR");

      const result = await client.getVersionDiff(created.id, "", "");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "invalid") throw new Error(`expected invalid, got ${result.kind}`);
      expect(result.status).toBe(400);
      expect(typeof result.reason).toBe("string");
    });
  });

  describe("compareAdrs (GET /api/compare)", () => {
    it("returns ok:true with a typed AdrCompareView for two distinct ADRs", async () => {
      const a = await createAdrViaClient("Compare A");
      const b = await createAdrViaClient("Compare B");

      const result = await client.compareAdrs(a.id, b.id);

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.comparison.a.id).toBe(a.id);
      expect(result.comparison.b.id).toBe(b.id);
      expect(Array.isArray(result.comparison.fields)).toBe(true);
    });

    it("returns a missingFields result on a 400 when a/b are omitted", async () => {
      const result = await client.compareAdrs("", "");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "missingFields") throw new Error(`expected missingFields, got ${result.kind}`);
      expect(result.missingFields).toEqual(expect.arrayContaining(["a", "b"]));
    });

    it("returns an invalid-reason result on a 400 when a === b", async () => {
      const a = await createAdrViaClient("Compare Self");

      const result = await client.compareAdrs(a.id, a.id);

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      if (result.kind !== "invalidReason") throw new Error(`expected invalidReason, got ${result.kind}`);
      expect(typeof result.reason).toBe("string");
    });

    it("returns ok:false with status 404 when an id does not exist", async () => {
      const a = await createAdrViaClient("Compare Exists");

      const result = await client.compareAdrs(a.id, "adr-9999");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });

  describe("search (GET /api/search)", () => {
    it("returns ok:true with a typed SearchHit[] for a matching query", async () => {
      await createAdrViaClient("Searchable unique-term-xyz ADR");

      const result = await client.search("unique-term-xyz");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(Array.isArray(result.hits)).toBe(true);
    });

    it("returns ok:true with an empty array for a non-matching query", async () => {
      const result = await client.search("zzz-no-such-term-zzz");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      expect(result.hits).toEqual([]);
    });
  });

  describe("getSimilar (GET /api/adrs/:id/similar)", () => {
    it("returns ok:true with kind:'ranked' and typed SimilarityResult[] for a sibling in scope", async () => {
      const target = await createAdrViaClient("Similar target");
      const savedTarget = await client.updateAdr(target.id, {
        title: "Similar target",
        status: "accepted",
        date: "2026-01-01",
        body: "Target body.",
        author: AUTHOR,
        baseBlobSha: target.blobSha,
      });
      if (!savedTarget.ok) throw new Error("fixture setup failed");
      seedVector(savedTarget.adr.blobSha, [1, 0, 0]);

      const sibling = await createAdrViaClient("Similar sibling");
      const savedSibling = await client.updateAdr(sibling.id, {
        title: "Similar sibling",
        status: "accepted",
        date: "2026-01-01",
        body: "Sibling body.",
        author: AUTHOR,
        baseBlobSha: sibling.blobSha,
      });
      if (!savedSibling.ok) throw new Error("fixture setup failed");
      seedVector(savedSibling.adr.blobSha, [0.9, 0.1, 0]);

      const result = await client.getSimilar(target.id, "decisions");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      if (result.kind !== "ranked") throw new Error(`expected ranked, got ${result.kind}`);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].adr.id).toBe(sibling.id);
      expect(typeof result.results[0].score).toBe("number");
    });

    it("returns ok:true with kind:'emptyScope' when alone in scope", async () => {
      const alone = await createAdrViaClient("Solo ADR", "decisions/solo");
      const saved = await client.updateAdr(alone.id, {
        title: "Solo ADR",
        status: "accepted",
        date: "2026-01-01",
        body: "Solo body.",
        author: AUTHOR,
        baseBlobSha: alone.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup failed");
      seedVector(saved.adr.blobSha, [1, 0, 0]);

      const result = await client.getSimilar(alone.id, "decisions/solo");

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected success");
      if (result.kind !== "emptyScope") throw new Error(`expected emptyScope, got ${result.kind}`);
    });

    it("returns ok:false with status 404 for an unknown id", async () => {
      const result = await client.getSimilar("adr-9999", "decisions");

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.status).toBe(404);
    });
  });
});
