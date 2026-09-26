import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import { simpleGit } from "simple-git";
import {
  JevSimilarityService,
  SimilarityProviderError,
  AdrEditingService,
  FolderService,
  RelationGraphService,
  HistoryService,
  ComparisonService,
  SearchService,
  SimilarityService,
  FeedService,
  SummarySuggestionService,
} from "@adr/core";
import { WriteQueue } from "./infrastructure/concurrency/writeQueue.js";
import { FakeEmbeddingProvider } from "./infrastructure/embeddings/fake.js";
import { GeminiEmbeddingProvider } from "./infrastructure/embeddings/gemini.js";
import { GeminiSummaryProvider } from "./infrastructure/summaries/geminiSummaryProvider.js";
import { SqliteSummaryStore } from "./infrastructure/persistence/sqliteSummaryStore.js";
import { buildContainer } from "./container.js";
import { parseSimilarityConfig, type SimilarityConfig } from "./similarityConfig.js";

const AUTHOR = "Test Author <test@example.com>";

function adrRaw(id: string, title: string): string {
  return `---
id: ${id}
title: ${title}
status: proposed
date: "2024-01-01"
---
Body for ${id}.
`;
}

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-container-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("buildContainer", () => {
  let repoPath: string;

  beforeEach(async () => {
    repoPath = await initRepo();
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("constructs every service with no missing dependency errors", () => {
    expect(() =>
      buildContainer({
        repoPath,
        sqlitePath: join(repoPath, "test.sqlite"),
        gemini: { model: "fake-model", apiKey: "fake-key" },
      })
    ).not.toThrow();
  });

  it("constructs real instances of every core service and the write queue", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    expect(container.adrEditing).toBeInstanceOf(AdrEditingService);
    expect(container.folders).toBeInstanceOf(FolderService);
    expect(container.relations).toBeInstanceOf(RelationGraphService);
    expect(container.history).toBeInstanceOf(HistoryService);
    expect(container.compare).toBeInstanceOf(ComparisonService);
    expect(container.search).toBeInstanceOf(SearchService);
    expect(container.similarity).toBeInstanceOf(SimilarityService);
    expect(container.writeQueue).toBeInstanceOf(WriteQueue);
  });

  it("wires every service to the same real git repository (functional smoke test)", async () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    // create() resolves the next id via a HEAD-relative tree scan, which
    // requires at least one existing commit in the repo.
    await container.git.writeAndCommit(
      "decisions/0001-first.md",
      adrRaw("adr-0001", "First decision"),
      "add first",
      AUTHOR
    );

    const created = await container.adrEditing.create(
      { title: "Second decision", folder: "decisions" },
      AUTHOR
    );

    await expect(container.relations.targetExists(created.id)).resolves.toBe(true);

    const timeline = await container.history.timeline(created.id);
    expect(timeline).toHaveLength(1);
    expect(timeline[0].message).toContain(created.id);
  });

  it("writes ADRs created via the raw git adapter into the same repo seen by other services", async () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    await container.git.writeAndCommit(
      "decisions/0001-first.md",
      adrRaw("adr-0001", "First decision"),
      "add first",
      AUTHOR
    );

    await expect(container.relations.targetExists("adr-0001")).resolves.toBe(true);
  });

  it("selects the offline FakeEmbeddingProvider when the gemini apiKey is empty (Req 3.1, 2.1, 2.4, 3.3)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });

    expect(container.embeddingProvider).toBeInstanceOf(FakeEmbeddingProvider);
  });

  it("treats a whitespace-only gemini apiKey as empty and selects FakeEmbeddingProvider (Req 3.1)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "   " },
    });

    expect(container.embeddingProvider).toBeInstanceOf(FakeEmbeddingProvider);
  });

  it("resolves embeddings offline (no network) via the fake provider when apiKey is empty (Req 2.4, 3.3)", async () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });

    const vectors = await container.embeddingProvider.embed(["x"]);
    expect(vectors).toHaveLength(1);
    expect(Array.isArray(vectors[0])).toBe(true);
    expect(vectors[0].length).toBeGreaterThan(0);
  });

  it("selects the real GeminiEmbeddingProvider when a gemini apiKey is configured (Req 3.2)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "some-key" },
    });

    expect(container.embeddingProvider).toBeInstanceOf(GeminiEmbeddingProvider);
  });

  it("wires FeedService, SummarySuggestionService, and the SQLite summary store (feed/suggestion endpoints' dependencies)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    expect(container.feed).toBeInstanceOf(FeedService);
    expect(container.summarySuggestion).toBeInstanceOf(SummarySuggestionService);
    expect(container.summaryStore).toBeInstanceOf(SqliteSummaryStore);

    // The store is real and functional against cfg.sqlitePath.
    container.summaryStore.set("sha-x", "Cached sentence.");
    expect(container.summaryStore.get("sha-x")).toBe("Cached sentence.");
  });

  it("selects a null summary provider when the gemini apiKey is blank, mirroring the embeddings selection (Req 13.5)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });

    expect(container.summaryProvider).toBeNull();
  });

  it("treats a whitespace-only gemini apiKey as blank for the summary provider too (Req 13.5)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "   " },
    });

    expect(container.summaryProvider).toBeNull();
  });

  it("constructs GeminiSummaryProvider with cfg.gemini.summaryModel when an apiKey is configured (Req 13.1)", () => {
    const container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "some-key", summaryModel: "summary-model-x" },
    });

    expect(container.summaryProvider).toBeInstanceOf(GeminiSummaryProvider);
    expect((container.summaryProvider as GeminiSummaryProvider).model).toBe("summary-model-x");
  });

  describe("similarity strategy selection", () => {
    function jevConfig(endpoint: string): SimilarityConfig {
      const result = parseSimilarityConfig({
        SIMILARITY_STRATEGY: "jev",
        JEV_ENDPOINT: endpoint,
        JEV_API_KEY: "test-jev-key",
      });
      if (!result.ok) throw new Error("expected a valid jev config");
      return result.config;
    }

    function judgmentTableExists(sqlitePath: string): boolean {
      const db = new Database(sqlitePath);
      try {
        return (
          db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jev_judgment_cache'")
            .get() !== undefined
        );
      } finally {
        db.close();
      }
    }

    it("wires today's embedding SimilarityService with strategy embedding when no similarity config is given (1.3, 8.3)", () => {
      const sqlitePath = join(repoPath, "test.sqlite");
      const container = buildContainer({
        repoPath,
        sqlitePath,
        gemini: { model: "fake-model", apiKey: "" },
      });

      expect(container.similarity).toBeInstanceOf(SimilarityService);
      expect(container.similarityStrategy).toBe("embedding");
      // The judgment cache is jev-only derived data (6.4).
      expect(judgmentTableExists(sqlitePath)).toBe(false);
    });

    it("wires the embedding SimilarityService for an explicit embedding config (1.3)", () => {
      const container = buildContainer({
        repoPath,
        sqlitePath: join(repoPath, "test.sqlite"),
        gemini: { model: "fake-model", apiKey: "" },
        similarity: { strategy: "embedding" },
      });

      expect(container.similarity).toBeInstanceOf(SimilarityService);
      expect(container.similarityStrategy).toBe("embedding");
    });

    it("wires JevSimilarityService with strategy jev and the SQLite judgment store for a parsed jev config (1.4, 2.9, 6.4)", () => {
      const sqlitePath = join(repoPath, "test.sqlite");
      const container = buildContainer({
        repoPath,
        sqlitePath,
        gemini: { model: "fake-model", apiKey: "" },
        similarity: jevConfig("http://127.0.0.1:9/api/alpha/decisions"),
      });

      expect(container.similarity).toBeInstanceOf(JevSimilarityService);
      expect(container.similarity).not.toBeInstanceOf(SimilarityService);
      expect(container.similarityStrategy).toBe("jev");
      expect(judgmentTableExists(sqlitePath)).toBe(true);
    });

    describe("jev wiring against a loopback Jev endpoint", () => {
      let server: Server;
      let endpoint: string;
      let hits: number;

      beforeEach(async () => {
        hits = 0;
        server = createServer((req, res) => {
          req.resume();
          req.on("end", () => {
            hits += 1;
            res.writeHead(500, { "content-type": "application/json" });
            res.end("{}");
          });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/alpha/decisions`;
      });

      afterEach(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      });

      it("judges through the configured HTTP endpoint and never falls back to embeddings on failure (1.4, 7.2)", async () => {
        const container = buildContainer({
          repoPath,
          sqlitePath: join(repoPath, "test.sqlite"),
          gemini: { model: "fake-model", apiKey: "" },
          similarity: jevConfig(endpoint),
        });
        await container.git.writeAndCommit(
          "decisions/0001-first.md",
          adrRaw("adr-0001", "First decision"),
          "add first",
          AUTHOR
        );
        await container.git.writeAndCommit(
          "decisions/0002-second.md",
          adrRaw("adr-0002", "Second decision"),
          "add second",
          AUTHOR
        );

        await expect(container.similarity.findSimilar("adr-0001", ".")).rejects.toBeInstanceOf(
          SimilarityProviderError
        );
        expect(hits).toBeGreaterThan(0);
      });
    });
  });
});
