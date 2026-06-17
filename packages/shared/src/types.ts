export type AdrId = string;

export type AdrStatus = "proposed" | "accepted" | "deprecated" | "superseded";

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
  title: string;
  status: AdrStatus;
  date: string;
  deciders?: string[];
  tags?: string[];
  relations?: AdrRelation[];
}

/** Pełny ADR = frontmatter + treść + pozycja w gicie. */
export interface Adr extends AdrFrontmatter {
  body: string;
  path: string;
  blobSha: string;
}

export interface SimilarityPair {
  a: AdrId;
  b: AdrId;
  score: number;
}
