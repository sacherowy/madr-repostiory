import type { EmbeddingProvider } from "@adr/core";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 768;
  constructor(
    readonly model: string,
    private apiKey: string
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${BASE}/${this.model}:batchEmbedContents?key=${this.apiKey}`;
    const body = {
      requests: texts.map((text) => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
      })),
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gemini embed ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { embeddings: { values: number[] }[] };
    return json.embeddings.map((e) => e.values);
  }
}
