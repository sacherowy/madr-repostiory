import type { Adr, SimilarityResult } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import type { EmbeddingProvider, EmbeddingStore } from "../ports/embeddings.js";
import { parseAdr } from "../adr/parse.js";
import { combinedSectionText } from "../adr/sections.js";
import { cosine } from "./cosine.js";

export type SimilarityFindResult =
  | { kind: "ranked"; results: SimilarityResult[] }
  | { kind: "emptyScope" };

/**
 * Ranks ADRs within a folder subtree by embedding similarity to a given
 * ADR. Vectors are resolved cache-first against EmbeddingStore (keyed by
 * blob sha) and only computed via EmbeddingProvider.embed on a genuine
 * cache miss — an edited ADR's next save produces a new blob sha, so a
 * stale vector is never reused after a content change (Req 10.4).
 *
 * Zero I/O beyond the injected ports: GitPort, EmbeddingStore,
 * EmbeddingProvider.
 */
export class SimilarityService {
  constructor(
    private readonly git: GitPort,
    private readonly store: EmbeddingStore,
    private readonly provider: EmbeddingProvider
  ) {}

  async findSimilar(id: string, scopePath: string): Promise<SimilarityFindResult> {
    const files = await this.git.listAdrFiles(scopePath);
    const adrs: Adr[] = [];
    for (const file of files) {
      const raw = await this.git.read(file.path);
      adrs.push(parseAdr(raw, file.path, file.blobSha));
    }

    const target = adrs.find((adr) => adr.id === id);
    if (!target) throw new Error(`ADR not found in scope: ${id}`);

    const others = adrs.filter((adr) => adr.id !== id);
    if (others.length === 0) return { kind: "emptyScope" };

    const targetVector = await this.vectorFor(target);

    const results: SimilarityResult[] = [];
    for (const other of others) {
      const otherVector = await this.vectorFor(other);
      results.push({
        adr: { id: other.id, title: other.title, status: other.status, path: other.path },
        score: cosine(targetVector, otherVector),
      });
    }

    results.sort((a, b) => b.score - a.score);
    return { kind: "ranked", results };
  }

  private async vectorFor(adr: Adr): Promise<number[]> {
    if (this.store.has(adr.blobSha)) {
      return this.store.get(adr.blobSha) as number[];
    }
    const combinedText = combinedSectionText(adr, adr.additionalContent);
    const [vector] = await this.provider.embed([`${adr.title}\n\n${combinedText}`]);
    this.store.set(adr.blobSha, vector);
    return vector;
  }
}
