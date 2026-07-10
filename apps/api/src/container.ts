import type {
  EmbeddingProvider,
  EmbeddingStore,
  GitPort,
  SearchIndex,
  SummaryProvider,
  SummaryStore,
} from "@adr/core";
import {
  AdrEditingService,
  ComparisonService,
  FeedService,
  FolderService,
  HistoryService,
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
import { SimpleGitAdapter } from "./infrastructure/git/simpleGitAdapter.js";
import { SqliteEmbeddingStore } from "./infrastructure/persistence/sqlite.js";
import { SqliteSearchIndex } from "./infrastructure/persistence/sqliteSearchIndex.js";
import { SqliteSummaryStore } from "./infrastructure/persistence/sqliteSummaryStore.js";

export interface ContainerConfig {
  repoPath: string;
  sqlitePath: string;
  /**
   * `summaryModel` is optional so pre-existing callers (tests, reindex
   * tooling) that predate the summary feature keep compiling; when omitted,
   * `buildContainer` falls back to the process-level `config` default.
   */
  gemini: { model: string; apiKey: string; summaryModel?: string };
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
  similarity: SimilarityService;
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
 */
export function buildContainer(cfg: ContainerConfig = config): Container {
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
  const similarity = new SimilarityService(git, embeddingStore, embeddingProvider);
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
    feed,
    summarySuggestion,
  };
}
