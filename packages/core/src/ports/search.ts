export interface SearchDoc {
  id: string;
  title: string;
  body: string;
  tags: string[];
}
export interface SearchHit {
  id: string;
  score: number;
}

/** Indeks pełnotekstowy — projekcja, odtwarzalna z gita. */
export interface SearchIndex {
  upsert(doc: SearchDoc): void;
  remove(id: string): void;
  search(query: string, limit?: number): SearchHit[];
}
