import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
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
});
