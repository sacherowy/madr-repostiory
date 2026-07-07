import { AdrSections } from "./adrSections.js";

export type AdrId = string;

export type AdrStatus = "proposed" | "accepted" | "deprecated" | "superseded" | "rejected";

export type RelationType =
  | "supersedes"
  | "superseded-by"
  | "relates-to"
  | "depends-on"
  | "conflicts-with";

export interface AdrRelation {
  type: RelationType;
  target: AdrId;
}

export interface AdrFrontmatter {
  id: AdrId;
  status: AdrStatus;
  date: string;
  /**
   * Author-owned one-line short description (11.1). Optional: records without
   * it remain valid (11.3), and the system never writes it without explicit
   * user acceptance (13.3). Round-trips through `parseAdr`/`serializeAdr` via
   * the existing frontmatter spread behavior.
   */
  summary?: string;
  decisionMakers?: string[];
  consulted?: string[];
  informed?: string[];
  tags?: string[];
  relations?: AdrRelation[];
}

/** Pełny ADR = frontmatter + treść + pozycja w gicie. */
export interface Adr extends AdrFrontmatter, AdrSections {
  title: string;
  additionalContent: string;
  path: string;
  blobSha: string;
}

export interface SimilarityPair {
  a: AdrId;
  b: AdrId;
  score: number;
}

/**
 * Minimal commit-metadata shape used by view types in this package.
 * Intentionally duplicated from `@adr/core`'s `GitPort` `CommitMeta` (same four
 * fields) rather than imported, because `@adr/shared` must not depend on
 * `@adr/core` (which itself depends on `@adr/shared`) — importing it would
 * create a circular workspace dependency.
 */
export interface CommitMeta {
  sha: string;
  author: string;
  date: string;
  message: string;
}

export interface AdrSummary {
  id: string;
  title: string;
  status: AdrStatus;
  path: string;
}

export interface FolderNode {
  path: string;
  name: string;
  folders: FolderNode[];
  adrs: AdrSummary[];
}

export interface RelationView {
  type: RelationType;
  target: AdrId;
  direction: "outbound" | "inbound";
}

export interface DiffHunk {
  kind: "added" | "removed" | "unchanged";
  text: string;
}

export interface VersionDiffView {
  from: CommitMeta;
  to: CommitMeta;
  hunks: DiffHunk[];
}

export interface FieldComparison {
  field: string;
  a: string;
  b: string;
  differs: boolean;
}

export interface AdrCompareView {
  a: Adr;
  b: Adr;
  fields: FieldComparison[];
}

export interface SimilarityResult {
  adr: AdrSummary;
  score: number;
}

export interface CreateAdrRequest {
  title: string;
  decisionMakers?: string[];
  consulted?: string[];
  informed?: string[];
  tags?: string[];
  folder: string;
}

export interface UpdateAdrRequest extends AdrSections {
  title: string;
  status: AdrStatus;
  date: string;
  decisionMakers?: string[];
  consulted?: string[];
  informed?: string[];
  tags?: string[];
  relations?: AdrRelation[];
  additionalContent: string;
  author: string;
  baseBlobSha: string;
}

export interface CreateFolderRequest {
  path: string;
  author: string;
}

export interface MoveAdrRequest {
  targetFolder: string;
  author: string;
}

/** Provenance of a decision's short description: author-written frontmatter
 * `summary` (layer 1, 11.2) or deterministic derivation (layer 2, 12.1-12.4). */
export type ShortDescriptionSource = "summary" | "derived";

/** Short-description value object; `source` records provenance so the UI can
 * show the resolution ladder (10.3). */
export interface ShortDescription {
  text: string;
  source: ShortDescriptionSource;
}

/**
 * Read-model projection powering Home/Topics/People/digest/search card
 * rendering. Derived per request from parsed ADRs; never persisted.
 */
export interface FeedCard {
  id: AdrId;
  title: string;
  status: AdrStatus;
  path: string;
  /** Parent folder path ("" = root). */
  topic: string;
  date: string;
  decisionMakers: string[];
  consulted: string[];
  informed: string[];
  shortDescription: ShortDescription;
}

/**
 * Discriminated union returned by the summary-suggestion endpoint; both
 * variants are HTTP 200 — absence of AI is not an error (13.5).
 */
export type SummarySuggestionResult =
  | { available: true; suggestion: string }
  | { available: false; reason: "no-provider" | "provider-error" };

/** Response of `GET /api/adrs/:id/raw`: the exact stored file bytes. */
export interface RawAdrContent {
  path: string;
  markdown: string;
}

/**
 * Intentionally duplicated from `@adr/core`'s `SearchIndex` port (same two
 * fields) rather than imported, because `@adr/shared` must not depend on
 * `@adr/core` (which itself depends on `@adr/shared`) — same rationale as
 * `CommitMeta` above. Any future change to one must be mirrored by hand.
 */
export interface SearchHit {
  id: string;
  score: number;
}
