import { describe, it, expect } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import type { SearchDoc, SearchIndex, SearchHit } from "../ports/search.js";
import { RelationGraphService } from "../relations/relationGraphService.js";
import { serializeAdr } from "./parse.js";
import { MADR_BODY_SCAFFOLD } from "./madrTemplate.js";
import { AdrEditingService } from "./editingService.js";

/**
 * In-memory fake GitPort test double, mirroring RelationGraphService's /
 * SimilarityService's established fake (files keyed by path, zero actual
 * I/O). Unlike those read-only fakes, writeAndCommit and move here actually
 * mutate the in-memory file map and bump a deliberately distinct "commit
 * sha" counter (`commit-N`) that is NEVER equal to any blob sha (`blob-...`),
 * so any conflation between CommitMeta.sha and currentBlobSha's return value
 * would be caught by assertions.
 */
class FakeGitPort implements GitPort {
  public listAdrFilesCalls: string[] = [];
  public writeAndCommitCalls: Array<{ path: string; content: string; message: string; author: string }> = [];
  private commitCounter = 0;
  private blobShaOverride = new Map<string, string>();

  constructor(private files: Map<string, string>) {}

  /** Lets a test pin the next blob sha that currentBlobSha(path) will return
   * for a given path after a write, instead of the default `blob-after-{path}-{n}`
   * auto-generated value — used to make "distinct from commit sha" assertions
   * trivial to write without depending on internal counters. */
  setNextBlobSha(path: string, sha: string): void {
    this.blobShaOverride.set(path, sha);
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`not found: ${path}`);
    return content;
  }

  async currentBlobSha(path: string): Promise<string | null> {
    const override = this.blobShaOverride.get(path);
    if (override) return override;
    if (!this.files.has(path)) return null;
    return `blob-${path}`;
  }

  async writeAndCommit(path: string, content: string, message: string, author: string): Promise<CommitMeta> {
    this.writeAndCommitCalls.push({ path, content, message, author });
    this.files.set(path, content);
    this.commitCounter += 1;
    return {
      sha: `commit-${this.commitCounter}`,
      author,
      date: "2024-01-01",
      message,
    };
  }

  async log(): Promise<CommitMeta[]> {
    throw new Error("not used in this test");
  }

  async diff(): Promise<DiffResult> {
    throw new Error("not used in this test");
  }

  async listAdrFiles(branchPath: string): Promise<AdrFile[]> {
    this.listAdrFilesCalls.push(branchPath);
    return Array.from(this.files.keys())
      .filter((p) => p.endsWith(".md"))
      .map((path) => ({ path, blobSha: this.blobShaOverride.get(path) ?? `blob-${path}` }));
  }

  async listTreeEntries(): Promise<TreeEntry[]> {
    throw new Error("not used in this test");
  }

  async move(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }
}

/** Minimal fake SearchIndex — records upsert calls, with an opt-in "throws on
 * upsert" mode for the non-fatal-indexing-failure test. */
class FakeSearchIndex implements SearchIndex {
  public upsertCalls: SearchDoc[] = [];
  public throwOnUpsert = false;

  upsert(doc: SearchDoc): void {
    this.upsertCalls.push(doc);
    if (this.throwOnUpsert) throw new Error("index unavailable");
  }

  remove(): void {
    throw new Error("not used in this test");
  }

  search(): SearchHit[] {
    throw new Error("not used in this test");
  }
}

function adrRaw(
  id: string,
  title: string,
  opts: { status?: string; date?: string; relations?: string; body?: string } = {}
): string {
  const status = opts.status ?? "proposed";
  const date = opts.date ?? "2024-01-01";
  const relBlock = opts.relations ? `relations:\n${opts.relations}\n` : "";
  const body = opts.body ?? `Body for ${id}.`;
  return `---
id: ${id}
title: ${title}
status: ${status}
date: "${date}"
${relBlock}---
${body}
`;
}

describe("AdrEditingService", () => {
  describe("create", () => {
    it("generates the next sequential id, going one past the true max even when a lower id is missing (gap not filled)", async () => {
      const files = new Map<string, string>([
        ["adr-0001.md", adrRaw("adr-0001", "First")],
        ["adr-0003.md", adrRaw("adr-0003", "Third")],
      ]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "New decision", folder: "." }, "Alice");

      expect(adr.id).toBe("adr-0004");
    });

    it("generates adr-0001 when the repo has zero existing ADRs", async () => {
      const files = new Map<string, string>();
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "First ever", folder: "." }, "Alice");

      expect(adr.id).toBe("adr-0001");
    });

    it("sets status to 'proposed' and date to today's ISO date", async () => {
      const git = new FakeGitPort(new Map());
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "New decision", folder: "." }, "Alice");

      expect(adr.status).toBe("proposed");
      expect(adr.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("sets body to the MADR scaffold instead of an empty string", async () => {
      const git = new FakeGitPort(new Map());
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "New decision", folder: "." }, "Alice");

      expect(adr.body).toBe(MADR_BODY_SCAFFOLD);
    });

    it("places the file at '${folder}/${id}.md' when folder is not '.'", async () => {
      const git = new FakeGitPort(new Map());
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "New decision", folder: "decisions" }, "Alice");

      expect(adr.path).toBe(`decisions/${adr.id}.md`);
    });

    it("places the file at '${id}.md' (no folder prefix) when folder is '.'", async () => {
      const git = new FakeGitPort(new Map());
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "New decision", folder: "." }, "Alice");

      expect(adr.path).toBe(`${adr.id}.md`);
    });

    it("returns the genuine blob sha from a currentBlobSha call, never the commit sha from writeAndCommit's CommitMeta", async () => {
      const git = new FakeGitPort(new Map());
      git.setNextBlobSha("adr-0001.md", "blob-distinct-xyz");
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const adr = await svc.create({ title: "New decision", folder: "." }, "Alice");

      expect(adr.blobSha).toBe("blob-distinct-xyz");
      expect(adr.blobSha).not.toBe("commit-1");
      expect(git.writeAndCommitCalls).toHaveLength(1);
    });

    it("does not call SearchIndex.upsert", async () => {
      const git = new FakeGitPort(new Map());
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      await svc.create({ title: "New decision", folder: "." }, "Alice");

      expect(search.upsertCalls).toHaveLength(0);
    });

    it("passes through decisionMakers/consulted/informed/tags as-is without defaulting to []", async () => {
      const git = new FakeGitPort(new Map());
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const withFields = await svc.create(
        {
          title: "New decision",
          folder: ".",
          decisionMakers: ["Alice"],
          consulted: ["Carol"],
          informed: ["Dave"],
          tags: ["infra"],
        },
        "Alice"
      );
      expect(withFields.decisionMakers).toEqual(["Alice"]);
      expect(withFields.consulted).toEqual(["Carol"]);
      expect(withFields.informed).toEqual(["Dave"]);
      expect(withFields.tags).toEqual(["infra"]);

      const without = await svc.create({ title: "Another", folder: "." }, "Alice");
      expect(without.decisionMakers).toBeUndefined();
      expect(without.consulted).toBeUndefined();
      expect(without.informed).toBeUndefined();
      expect(without.tags).toBeUndefined();
    });
  });

  describe("save", () => {
    it("happy path: valid input + matching baseBlobSha + no relations -> saved with genuine new blob sha, and upserts into the search index", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      git.setNextBlobSha("adr-0001.md", "blob-after-save");
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      // Reset the override so the *post-write* call yields the distinct value.
      git.setNextBlobSha("adr-0001.md", "blob-after-save");

      const result = await svc.save(
        "adr-0001",
        {
          title: "Updated title",
          status: "accepted",
          date: "2024-02-02",
          decisionMakers: ["Bob"],
          consulted: ["Carol"],
          informed: ["Dave"],
          tags: ["security"],
          body: "Updated body.",
        },
        baseBlobSha as string,
        "Bob"
      );

      expect(result.kind).toBe("saved");
      if (result.kind !== "saved") throw new Error("expected saved");
      expect(result.adr.title).toBe("Updated title");
      expect(result.adr.decisionMakers).toEqual(["Bob"]);
      expect(result.adr.consulted).toEqual(["Carol"]);
      expect(result.adr.informed).toEqual(["Dave"]);
      expect(result.adr.blobSha).toBe("blob-after-save");
      expect(result.adr.blobSha).not.toMatch(/^commit-/);
      expect(search.upsertCalls).toEqual([
        { id: "adr-0001", title: "Updated title", body: "Updated body.", tags: ["security"] },
      ]);
    });

    it("returns {kind:'invalid', missingFields:['title']} when title is missing", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const result = await svc.save(
        "adr-0001",
        { title: "", status: "proposed", date: "2024-01-01", body: "Has body" },
        "irrelevant",
        "Bob"
      );

      expect(result).toEqual({ kind: "invalid", missingFields: ["title"] });
    });

    it("returns {kind:'invalid', missingFields:['body']} when body is missing", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const result = await svc.save(
        "adr-0001",
        { title: "Has title", status: "proposed", date: "2024-01-01", body: "" },
        "irrelevant",
        "Bob"
      );

      expect(result).toEqual({ kind: "invalid", missingFields: ["body"] });
    });

    it("returns {kind:'invalid', missingFields:['title','body']} (exact order) when both are missing", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const result = await svc.save(
        "adr-0001",
        { title: "", status: "proposed", date: "2024-01-01", body: "" },
        "irrelevant",
        "Bob"
      );

      expect(result).toEqual({ kind: "invalid", missingFields: ["title", "body"] });
    });

    it("returns {kind:'conflict', latest} reflecting current content when baseBlobSha is stale, and never calls writeAndCommit", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const result = await svc.save(
        "adr-0001",
        { title: "Updated title", status: "accepted", date: "2024-02-02", body: "Updated body." },
        "stale-sha-not-current",
        "Bob"
      );

      expect(result.kind).toBe("conflict");
      if (result.kind !== "conflict") throw new Error("expected conflict");
      expect(result.latest.id).toBe("adr-0001");
      expect(result.latest.title).toBe("Original");
      expect(result.latest.blobSha).toBe("blob-adr-0001.md");
      expect(git.writeAndCommitCalls).toHaveLength(0);
    });

    it("returns {kind:'invalidRelations', missingTargets} when a relation points to a non-existent target, and never calls writeAndCommit", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      const result = await svc.save(
        "adr-0001",
        {
          title: "Updated title",
          status: "accepted",
          date: "2024-02-02",
          body: "Updated body.",
          relations: [{ type: "relates-to", target: "adr-9999" }],
        },
        baseBlobSha as string,
        "Bob"
      );

      expect(result).toEqual({ kind: "invalidRelations", missingTargets: ["adr-9999"] });
      expect(git.writeAndCommitCalls).toHaveLength(0);
    });

    it("includes only the actually-missing targets when some relations are valid and some are not", async () => {
      const files = new Map<string, string>([
        ["adr-0001.md", adrRaw("adr-0001", "Original")],
        ["adr-0002.md", adrRaw("adr-0002", "Valid target")],
      ]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      const result = await svc.save(
        "adr-0001",
        {
          title: "Updated title",
          status: "accepted",
          date: "2024-02-02",
          body: "Updated body.",
          relations: [
            { type: "relates-to", target: "adr-0002" },
            { type: "depends-on", target: "adr-8888" },
            { type: "conflicts-with", target: "adr-7777" },
          ],
        },
        baseBlobSha as string,
        "Bob"
      );

      expect(result).toEqual({
        kind: "invalidRelations",
        missingTargets: ["adr-8888", "adr-7777"],
      });
    });

    it("succeeds with status 'rejected' and no relations present (relation existence is independent of status)", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      const result = await svc.save(
        "adr-0001",
        {
          title: "Updated title",
          status: "rejected",
          date: "2024-02-02",
          body: "Updated body.",
        },
        baseBlobSha as string,
        "Bob"
      );

      expect(result.kind).toBe("saved");
      if (result.kind !== "saved") throw new Error("expected saved");
      expect(result.adr.status).toBe("rejected");
    });

    it("succeeds with status 'superseded' and an explicitly empty relations array (relation existence is independent of status)", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      const result = await svc.save(
        "adr-0001",
        {
          title: "Updated title",
          status: "superseded",
          date: "2024-02-02",
          body: "Updated body.",
          relations: [],
        },
        baseBlobSha as string,
        "Bob"
      );

      expect(result.kind).toBe("saved");
      if (result.kind !== "saved") throw new Error("expected saved");
      expect(result.adr.status).toBe("superseded");
      expect(result.adr.relations).toEqual([]);
    });

    it("throws when the given id does not resolve to any existing ADR", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      await expect(
        svc.save(
          "adr-9999",
          { title: "Title", status: "proposed", date: "2024-01-01", body: "Body" },
          "irrelevant",
          "Bob"
        )
      ).rejects.toThrow();
    });

    it("a search-index upsert failure does not fail the overall save", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      search.throwOnUpsert = true;
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      const result = await svc.save(
        "adr-0001",
        { title: "Updated title", status: "accepted", date: "2024-02-02", body: "Updated body." },
        baseBlobSha as string,
        "Bob"
      );

      expect(result.kind).toBe("saved");
      expect(search.upsertCalls).toHaveLength(1);
    });

    it("a successful save is reflected in a subsequent read against the same path", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      const result = await svc.save(
        "adr-0001",
        { title: "Updated title", status: "accepted", date: "2024-02-02", body: "Brand new body." },
        baseBlobSha as string,
        "Bob"
      );
      expect(result.kind).toBe("saved");

      const reRead = await git.read("adr-0001.md");
      expect(reRead).toContain("Brand new body.");
      expect(reRead).toContain("Updated title");
    });

    it("commits via writeAndCommit using the existing serializeAdr function for the produced content", async () => {
      const files = new Map<string, string>([["adr-0001.md", adrRaw("adr-0001", "Original")]]);
      const git = new FakeGitPort(files);
      const relations = new RelationGraphService(git);
      const search = new FakeSearchIndex();
      const svc = new AdrEditingService(git, relations, search);

      const baseBlobSha = await git.currentBlobSha("adr-0001.md");
      await svc.save(
        "adr-0001",
        { title: "Updated title", status: "accepted", date: "2024-02-02", body: "Updated body." },
        baseBlobSha as string,
        "Bob"
      );

      expect(git.writeAndCommitCalls).toHaveLength(1);
      const call = git.writeAndCommitCalls[0];
      expect(call.path).toBe("adr-0001.md");
      expect(call.author).toBe("Bob");
      const expectedSerialized = serializeAdr({
        id: "adr-0001",
        title: "Updated title",
        status: "accepted",
        date: "2024-02-02",
        body: "Updated body.",
        path: "adr-0001.md",
        blobSha: "irrelevant-for-serialization",
      });
      expect(call.content).toBe(expectedSerialized);
    });
  });
});
