import { describe, it, expect } from "vitest";
import { GeminiEmbeddingProvider } from "./gemini.js";

const key = process.env.GEMINI_API_KEY;

// Odpala się tylko przy włączonej sieci (Trusted) i ustawionym GEMINI_API_KEY.
describe.skipIf(!key)("Gemini (integracja)", () => {
  it("zwraca niepusty wektor", async () => {
    const p = new GeminiEmbeddingProvider(
      process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
      key!
    );
    const [v] = await p.embed(["Architecture Decision Record"]);
    expect(v.length).toBeGreaterThan(0);
  });
});
