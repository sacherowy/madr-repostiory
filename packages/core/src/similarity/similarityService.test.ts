import { describe, it, expect } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import type { EmbeddingProvider, EmbeddingStore } from "../ports/embeddings.js";
import { SimilarityService } from "./similarityService.js";

/**
 * In-memory fake GitPort test double, mirroring ComparisonService's /
 * RelationGraphService's established fake (files keyed by path). Zero actual
 * I/O. listAdrFiles ignores the branchPath argument and returns every file —
 * scoping by subtree is not under test here (GitPort is trusted to do this
 * correctly; SimilarityService only consumes whatever it returns).
 */
class FakeGitPort implements GitPort {
  public listAdrFilesCalls: string[] = [];

  constructor(private files: Map<string, { content: string; blobSha: string }>) {}

  async read(path: string): Promise<string> {
    const entry = this.files.get(path);
    if (entry === undefined) throw new Error(`not found: ${path}`);
    return entry.content;
  }

  async currentBlobSha(): Promise<string | null> {
    throw new Error("not used in this test");
  }

  async writeAndCommit(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }

  async log(): Promise<CommitMeta[]> {
    throw new Error("not used in this test");
  }

  async diff(): Promise<DiffResult> {
    throw new Error("not used in this test");
  }

  async listAdrFiles(branchPath: string): Promise<AdrFile[]> {
    this.listAdrFilesCalls.push(branchPath);
    return Array.from(this.files.entries()).map(([path, { blobSha }]) => ({ path, blobSha }));
  }

  async listTreeEntries(): Promise<TreeEntry[]> {
    throw new Error("not used in this test");
  }

  async move(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }
}

/** In-memory fake EmbeddingStore — a plain Map-backed cache keyed by blobSha. */
class FakeEmbeddingStore implements EmbeddingStore {
  public setCalls: Array<{ blobSha: string; vector: number[] }> = [];

  constructor(private vectors: Map<string, number[]> = new Map()) {}

  get(blobSha: string): number[] | null {
    return this.vectors.get(blobSha) ?? null;
  }

  has(blobSha: string): boolean {
    return this.vectors.has(blobSha);
  }

  set(blobSha: string, vector: number[]): void {
    this.setCalls.push({ blobSha, vector });
    this.vectors.set(blobSha, vector);
  }
}

/**
 * Fake EmbeddingProvider that returns pre-programmed vectors keyed by the
 * exact text it was called with, so tests can assert both the call args and
 * control the resulting score computation precisely. Throws on an
 * unprogrammed text so an unexpected call (e.g. for a cache hit that should
 * never reach the provider) fails loudly rather than silently.
 */
class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fake";
  readonly dimensions = 3;
  public embedCalls: string[][] = [];

  constructor(private vectorsByText: Map<string, number[]>) {}

  async embed(texts: string[]): Promise<number[][]> {
    this.embedCalls.push(texts);
    return texts.map((t) => {
      const v = this.vectorsByText.get(t);
      if (v === undefined) throw new Error(`unexpected embed() call for text: ${t}`);
      return v;
    });
  }
}

function adrRaw(id: string, title: string, body = `Body for ${id}.`): string {
  return `---
id: ${id}
title: ${title}
status: proposed
date: "2024-01-01"
---
${body}
`;
}

describe("SimilarityService", () => {
  describe("findSimilar", () => {
    it("ranks other ADRs by descending cosine score, excluding the target itself", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
        ["decisions/0002-close.md", { content: adrRaw("adr-0002", "Close"), blobSha: "sha-2" }],
        ["decisions/0003-far.md", { content: adrRaw("adr-0003", "Far"), blobSha: "sha-3" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(
        new Map([
          ["sha-1", [1, 0, 0]],
          ["sha-2", [0.9, 0.1, 0]],
          ["sha-3", [0, 1, 0]],
        ])
      );
      const provider = new FakeEmbeddingProvider(new Map());
      const svc = new SimilarityService(git, store, provider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      expect(result.kind).toBe("ranked");
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.results.map((r) => r.adr.id)).toEqual(["adr-0002", "adr-0003"]);
      expect(result.results[0].score).toBeGreaterThan(result.results[1].score);
      expect(result.results.every((r) => r.adr.id !== "adr-0001")).toBe(true);
      expect(result.results[0]).toEqual({
        adr: { id: "adr-0002", title: "Close", status: "proposed", path: "decisions/0002-close.md" },
        score: result.results[0].score,
      });
    });

    it("uses the cached vector on a cache hit and never calls EmbeddingProvider.embed for that blob sha", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
        ["decisions/0002-other.md", { content: adrRaw("adr-0002", "Other"), blobSha: "sha-2" }],
      ]);
      const git = new FakeGitPort(files);
      // Pre-seed the store with the "real" vectors for both blobs.
      const store = new FakeEmbeddingStore(
        new Map([
          ["sha-1", [1, 0, 0]],
          ["sha-2", [1, 0, 0]],
        ])
      );
      // If embed() were (incorrectly) called, it would throw because no text
      // is programmed — proving the provider is never invoked on a hit.
      const provider = new FakeEmbeddingProvider(new Map());
      const svc = new SimilarityService(git, store, provider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      expect(provider.embedCalls).toHaveLength(0);
      expect(result.kind).toBe("ranked");
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.results[0].score).toBeCloseTo(1, 5);
    });

    it("computes and stores a fresh embedding on a cache miss, using exactly `${title}\\n\\n${combinedSectionText}`", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target", "Target body."), blobSha: "sha-1" }],
        ["decisions/0002-other.md", { content: adrRaw("adr-0002", "Other", "Other body."), blobSha: "sha-2" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(new Map([["sha-1", [1, 0, 0]]]));
      const expectedText = "Other\n\nOther body.";
      const provider = new FakeEmbeddingProvider(new Map([[expectedText, [0, 1, 0]]]));
      const svc = new SimilarityService(git, store, provider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      expect(provider.embedCalls).toEqual([[expectedText]]);
      expect(store.setCalls).toEqual([{ blobSha: "sha-2", vector: [0, 1, 0] }]);
      expect(result.kind).toBe("ranked");
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.results[0].adr.id).toBe("adr-0002");
      expect(result.results[0].score).toBeCloseTo(0, 5);
    });

    it("builds the embedding text from the combined content of all sections, not just one, when content is spread across multiple MADR section fields", async () => {
      const otherBody = [
        "## Context and Problem Statement",
        "",
        "Marker contextzzzalpha needs a decision.",
        "",
        "## Decision Drivers",
        "",
        "Marker driverzzzbeta requires high availability.",
        "",
        "## Decision Outcome",
        "",
        "Marker outcomezzzgamma chosen.",
        "",
      ].join("\n");
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target", "Target body."), blobSha: "sha-1" }],
        ["decisions/0002-other.md", { content: adrRaw("adr-0002", "Other", otherBody), blobSha: "sha-2" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(new Map([["sha-1", [1, 0, 0]]]));
      const provider = new FakeEmbeddingProvider(new Map());
      // Program a catch-all so the exact text doesn't need to be replicated
      // here -- only its content is asserted below -- while still failing
      // loudly (via FakeEmbeddingProvider) on any other unprogrammed call.
      const recordingProvider: EmbeddingProvider = {
        model: provider.model,
        dimensions: provider.dimensions,
        embed: async (texts: string[]) => {
          provider.embedCalls.push(texts);
          return texts.map(() => [0, 1, 0]);
        },
      };
      const svc = new SimilarityService(git, store, recordingProvider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      // Asserting all three sections' marker text appears in the single
      // call's text proves the combined content of multiple sections (not
      // just one field) made it into the text passed to embed().
      expect(provider.embedCalls).toHaveLength(1);
      const embeddedText = provider.embedCalls[0][0];
      expect(embeddedText).toContain("Marker contextzzzalpha needs a decision.");
      expect(embeddedText).toContain("Marker driverzzzbeta requires high availability.");
      expect(embeddedText).toContain("Marker outcomezzzgamma chosen.");
      expect(embeddedText.startsWith("Other\n\n")).toBe(true);
      expect(result.kind).toBe("ranked");
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.results[0].adr.id).toBe("adr-0002");
    });

    it("never calls EmbeddingStore.set for a blob sha that was already a cache hit", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
        ["decisions/0002-hit.md", { content: adrRaw("adr-0002", "Hit"), blobSha: "sha-2" }],
        ["decisions/0003-miss.md", { content: adrRaw("adr-0003", "Miss", "Miss body."), blobSha: "sha-3" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(
        new Map([
          ["sha-1", [1, 0, 0]],
          ["sha-2", [0.5, 0.5, 0]],
        ])
      );
      const expectedText = "Miss\n\nMiss body.";
      const provider = new FakeEmbeddingProvider(new Map([[expectedText, [0, 0, 1]]]));
      const svc = new SimilarityService(git, store, provider);

      await svc.findSimilar("adr-0001", "decisions");

      const shasSetCalled = store.setCalls.map((c) => c.blobSha);
      expect(shasSetCalled).not.toContain("sha-1");
      expect(shasSetCalled).not.toContain("sha-2");
      expect(shasSetCalled).toEqual(["sha-3"]);
    });

    it("returns a distinct emptyScope result when the subtree contains only the target ADR", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(new Map([["sha-1", [1, 0, 0]]]));
      const provider = new FakeEmbeddingProvider(new Map());
      const svc = new SimilarityService(git, store, provider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      expect(result).toEqual({ kind: "emptyScope" });
    });

    it("treats an edited ADR's new blob sha (never seen before) as a guaranteed cache miss, forcing recomputation instead of reusing a stale vector", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
        [
          "decisions/0002-edited.md",
          { content: adrRaw("adr-0002", "Edited", "New body after edit."), blobSha: "sha-2-new" },
        ],
      ]);
      const git = new FakeGitPort(files);
      // The store still has the STALE vector under the OLD sha, but never
      // under "sha-2-new" — simulating that the ADR's body changed and git
      // produced a brand new blob sha for the same logical ADR.
      const store = new FakeEmbeddingStore(
        new Map([
          ["sha-1", [1, 0, 0]],
          ["sha-2-old-stale", [0.99, 0.01, 0]],
        ])
      );
      const expectedText = "Edited\n\nNew body after edit.";
      const freshVector = [0, 0, 1];
      const provider = new FakeEmbeddingProvider(new Map([[expectedText, freshVector]]));
      const svc = new SimilarityService(git, store, provider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      // Recomputed via the provider for the new sha, not pulled from the
      // stale cache entry under the old sha.
      expect(provider.embedCalls).toEqual([[expectedText]]);
      expect(store.setCalls).toEqual([{ blobSha: "sha-2-new", vector: freshVector }]);
      expect(result.kind).toBe("ranked");
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.results[0].score).toBeCloseTo(0, 5);
    });

    it("excludes the target itself from results even though self-similarity (cosine of itself) would be the highest possible score", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
        ["decisions/0002-other.md", { content: adrRaw("adr-0002", "Other"), blobSha: "sha-2" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(
        new Map([
          ["sha-1", [1, 0, 0]],
          ["sha-2", [0, 1, 0]],
        ])
      );
      const provider = new FakeEmbeddingProvider(new Map());
      const svc = new SimilarityService(git, store, provider);

      const result = await svc.findSimilar("adr-0001", "decisions");

      expect(result.kind).toBe("ranked");
      if (result.kind !== "ranked") throw new Error("expected ranked");
      expect(result.results.some((r) => r.adr.id === "adr-0001")).toBe(false);
      expect(result.results).toHaveLength(1);
    });

    it("passes the given scopePath through to GitPort.listAdrFiles", async () => {
      const files = new Map([
        ["decisions/0001-target.md", { content: adrRaw("adr-0001", "Target"), blobSha: "sha-1" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(new Map([["sha-1", [1, 0, 0]]]));
      const provider = new FakeEmbeddingProvider(new Map());
      const svc = new SimilarityService(git, store, provider);

      await svc.findSimilar("adr-0001", "decisions/sub");

      expect(git.listAdrFilesCalls).toEqual(["decisions/sub"]);
    });

    it("throws when the target id does not resolve to any ADR in scope (violated precondition)", async () => {
      const files = new Map([
        ["decisions/0001-other.md", { content: adrRaw("adr-0001", "Other"), blobSha: "sha-1" }],
      ]);
      const git = new FakeGitPort(files);
      const store = new FakeEmbeddingStore(new Map([["sha-1", [1, 0, 0]]]));
      const provider = new FakeEmbeddingProvider(new Map());
      const svc = new SimilarityService(git, store, provider);

      await expect(svc.findSimilar("adr-9999", "decisions")).rejects.toThrow();
    });
  });
});
