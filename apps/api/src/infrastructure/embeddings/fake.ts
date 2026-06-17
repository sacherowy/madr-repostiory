import type { EmbeddingProvider } from "@adr/core";

/** Deterministyczny embedding do testów jednostkowych — żadnej sieci. */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fake";
  constructor(readonly dimensions = 64) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array(this.dimensions).fill(0);
      for (let i = 0; i < t.length; i++) v[t.charCodeAt(i) % this.dimensions] += 1;
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}
