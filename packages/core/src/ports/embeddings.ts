export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Cache wektorów kluczowany SHA blobu — pochodny, odtwarzalny z gita. */
export interface EmbeddingStore {
  get(blobSha: string): number[] | null;
  has(blobSha: string): boolean;
  set(blobSha: string, vector: number[]): void;
}
