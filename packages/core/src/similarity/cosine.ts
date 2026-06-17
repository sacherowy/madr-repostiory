import type { SimilarityPair } from "@adr/shared";

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Embedded {
  id: string;
  vector: number[];
}

/** Ranking par podobieństwa, malejąco. */
export function rankPairs(items: Embedded[], threshold = 0): SimilarityPair[] {
  const out: SimilarityPair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const score = cosine(items[i].vector, items[j].vector);
      if (score >= threshold) out.push({ a: items[i].id, b: items[j].id, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
