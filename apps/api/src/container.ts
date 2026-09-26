import type {
  EmbeddingProvider,
  EmbeddingStore,
  GitPort,
  SearchIndex,
  SimilarityFinder,
  SummaryProvider,
  SummaryStore,
} from "@adr/core";
import {
  AdrEditingService,
  ComparisonService,
  FeedService,
  FolderService,
  HistoryService,
  JevSimilarityService,
  RelationGraphService,
  SearchService,
  SimilarityService,
  SummarySuggestionService,
} from "@adr/core";
import { config } from "./config.js";
import { WriteQueue } from "./infrastructure/concurrency/writeQueue.js";
import { FakeEmbeddingProvider } from "./infrastructure/embeddings/fake.js";
import { GeminiEmbeddingProvider } from "./infrastructure/embeddings/gemini.js";
import { GeminiSummaryProvider } from "./infrastructure/summaries/geminiSummaryProvider.js";
import { JevSimilarityJudge } from "./infrastructure/jev/jevSimilarityJudge.js";
import { SimpleGitAdapter } from "./infrastructure/git/simpleGitAdapter.js";
import { SqliteEmbeddingStore } from "./infrastructure/persistence/sqlite.js";
import { SqliteSearchIndex } from "./infrastructure/persistence/sqliteSearchIndex.js";
import { SqliteSummaryStore } from "./infrastructure/persistence/sqliteSummaryStore.js";
import { SqliteJudgmentStore } from "./infrastructure/persistence/sqliteJudgmentStore.js";
import type { SimilarityConfig, SimilarityStrategyName } from "./similarityConfig.js";

export interface ContainerConfig {
  repoPath: string;
  sqlitePath: string;
  /**
   * `summaryModel` is optional so pre-existing callers (tests, reindex
   * tooling) that predate the summary feature keep compiling; when omitted,
   * `buildContainer` falls back to the process-level `config.gemini.summaryModel`.
   */
  gemini: { model: string; apiKey: string; summaryModel?: string };
  /**
   * Absent → `{ strategy: "embedding" }`, so existing callers compile
   * unchanged (8.3). A `jev` config can only come from
   * `parseSimilarityConfig` (branded `ValidatedJevConfig`, 2.9).
   */
  similarity?: SimilarityConfig;
}

export interface Container {
  git: GitPort;
  searchIndex: SearchIndex;
  embeddingStore: EmbeddingStore;
  embeddingProvider: EmbeddingProvider;
  summaryStore: SummaryStore;
  /** `null` = no Gemini API key configured — suggestions degrade to
   * `no-provider`, never an error (req 13.5). */
  summaryProvider: SummaryProvider | null;
  writeQueue: WriteQueue;
  adrEditing: AdrEditingService;
  folders: FolderService;
  relations: RelationGraphService;
  history: HistoryService;
  compare: ComparisonService;
  search: SearchService;
  similarity: SimilarityFinder;
  /** Selected once at startup for the process lifetime (1.5). */
  similarityStrategy: SimilarityStrategyName;
  feed: FeedService;
  summarySuggestion: SummarySuggestionService;
}

/**
 * Composition root: instantiates every adapter exactly once from `cfg` and
 * uses them to construct every core service exactly once per process.
 *
 * `SqliteSearchIndex`, `SqliteEmbeddingStore`, and `SqliteSummaryStore` all
 * point at the same `cfg.sqlitePath` file (separate `better-sqlite3`
 * connections, same file — mirrors `embedding_cache`'s existing co-location,
 * see design.md).
 *
 * `RelationGraphService` is built before `AdrEditingService` since the
 * latter takes the former as a constructor argument.
 *
 * A single `WriteQueue` is constructed here (not by individual route
 * plugins) so that future route plugins serializing writes against this
 * repository (ADR create/save, folder create, ADR move) all share the same
 * queue instance.
 *
 * Similarity is selected from `cfg.similarity` (absent → embedding): the
 * embedding strategy keeps today's wiring (1.3); the jev strategy wires the
 * HTTP judge and the SQLite judgment store, and never the embedding adapters
 * (1.4, 7.2) — those are still built for their other consumers.
 */
export function buildContainer(cfg: ContainerConfig): Container {
  const git = new SimpleGitAdapter(cfg.repoPath);
  const searchIndex = new SqliteSearchIndex(cfg.sqlitePath);
  const embeddingStore = new SqliteEmbeddingStore(cfg.sqlitePath);
  const embeddingProvider =
    cfg.gemini.apiKey.trim() === ""
      ? new FakeEmbeddingProvider()
      : new GeminiEmbeddingProvider(cfg.gemini.model, cfg.gemini.apiKey);

  // Same blank-key selection as embeddings, except suggestions have no
  // offline fake: absence of a key means absence of a provider (`null`), and
  // SummarySuggestionService degrades to `no-provider` (req 13.5).
  const summaryStore = new SqliteSummaryStore(cfg.sqlitePath);
  const summaryProvider =
    cfg.gemini.apiKey.trim() === ""
      ? null
      : new GeminiSummaryProvider(
          cfg.gemini.summaryModel ?? config.gemini.summaryModel,
          cfg.gemini.apiKey
        );

  const writeQueue = new WriteQueue();

  const relations = new RelationGraphService(git);
  const adrEditing = new AdrEditingService(git, relations, searchIndex);
  const folders = new FolderService(git);
  const history = new HistoryService(git);
  const compare = new ComparisonService(git);
  const search = new SearchService(searchIndex);
  const similarityConfig = cfg.similarity ?? { strategy: "embedding" };
  const similarity: SimilarityFinder =
    similarityConfig.strategy === "jev"
      ? new JevSimilarityService(
          git,
          new JevSimilarityJudge(similarityConfig.jev),
          new SqliteJudgmentStore(cfg.sqlitePath),
          {
            maxCandidates: similarityConfig.jev.maxCandidates,
            concurrency: similarityConfig.jev.concurrency,
            requestBudgetMs: similarityConfig.jev.requestBudgetMs,
          }
        )
      : new SimilarityService(git, embeddingStore, embeddingProvider);
  const feed = new FeedService(git);
  const summarySuggestion = new SummarySuggestionService(summaryProvider, summaryStore);

  return {
    git,
    searchIndex,
    embeddingStore,
    embeddingProvider,
    summaryStore,
    summaryProvider,
    writeQueue,
    adrEditing,
    folders,
    relations,
    history,
    compare,
    search,
    similarity,
    similarityStrategy: similarityConfig.strategy,
    feed,
    summarySuggestion,
  };
}
