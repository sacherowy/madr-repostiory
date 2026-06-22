import type { EmbeddingProvider, EmbeddingStore, GitPort, SearchIndex } from "@adr/core";
import {
  AdrEditingService,
  ComparisonService,
  FolderService,
  HistoryService,
  RelationGraphService,
  SearchService,
  SimilarityService,
} from "@adr/core";
import { config } from "./config.js";
import { WriteQueue } from "./infrastructure/concurrency/writeQueue.js";
import { FakeEmbeddingProvider } from "./infrastructure/embeddings/fake.js";
import { GeminiEmbeddingProvider } from "./infrastructure/embeddings/gemini.js";
import { SimpleGitAdapter } from "./infrastructure/git/simpleGitAdapter.js";
import { SqliteEmbeddingStore } from "./infrastructure/persistence/sqlite.js";
import { SqliteSearchIndex } from "./infrastructure/persistence/sqliteSearchIndex.js";

export interface ContainerConfig {
  repoPath: string;
  sqlitePath: string;
  gemini: { model: string; apiKey: string };
}

export interface Container {
  git: GitPort;
  searchIndex: SearchIndex;
  embeddingStore: EmbeddingStore;
  embeddingProvider: EmbeddingProvider;
  writeQueue: WriteQueue;
  adrEditing: AdrEditingService;
  folders: FolderService;
  relations: RelationGraphService;
  history: HistoryService;
  compare: ComparisonService;
  search: SearchService;
  similarity: SimilarityService;
}

/**
 * Composition root: instantiates every adapter exactly once from `cfg` and
 * uses them to construct every core service exactly once per process.
 *
 * `SqliteSearchIndex` and `SqliteEmbeddingStore` both point at the same
 * `cfg.sqlitePath` file (separate `better-sqlite3` connections, same file —
 * mirrors `embedding_cache`'s existing co-location, see design.md).
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

  const writeQueue = new WriteQueue();

  const relations = new RelationGraphService(git);
  const adrEditing = new AdrEditingService(git, relations, searchIndex);
  const folders = new FolderService(git);
  const history = new HistoryService(git);
  const compare = new ComparisonService(git);
  const search = new SearchService(searchIndex);
  const similarity = new SimilarityService(git, embeddingStore, embeddingProvider);

  return {
    git,
    searchIndex,
    embeddingStore,
    embeddingProvider,
    writeQueue,
    adrEditing,
    folders,
    relations,
    history,
    compare,
    search,
    similarity,
  };
}
