import { describe, it, expect } from "vitest";
import type { Adr } from "@adr/shared";
import type { SummaryProvider, SummaryStore } from "../ports/summaries.js";
import { SummarySuggestionService } from "./summarySuggestionService.js";

/**
 * In-memory spy doubles, zero I/O (same constraint as the other core service
 * tests). Both record every call so the tests can assert not just results but
 * the absence of provider/store interaction (13.2, 13.5).
 */
class SpyStore implements SummaryStore {
  getCalls: string[] = [];
  setCalls: Array<{ blobSha: string; summary: string }> = [];

  constructor(private entries: Map<string, string> = new Map()) {}

  get(blobSha: string): string | null {
    this.getCalls.push(blobSha);
    return this.entries.get(blobSha) ?? null;
  }

  set(blobSha: string, summary: string): void {
    this.setCalls.push({ blobSha, summary });
    this.entries.set(blobSha, summary);
  }
}

class SpyProvider implements SummaryProvider {
  calls: Array<{ title: string; context: string; outcome: string }> = [];

  constructor(private behavior: () => Promise<string>) {}

  generateSummary(input: { title: string; context: string; outcome: string }): Promise<string> {
    this.calls.push(input);
    return this.behavior();
  }
}

function makeAdr(overrides: Partial<Adr> = {}): Adr {
  return {
    id: "0001-use-postgres",
    status: "accepted",
    date: "2026-06-01",
    title: "Use Postgres",
    contextAndProblemStatement: "We need a durable relational store.",
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome: "Chosen option: Postgres, because it fits.",
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
    additionalContent: "",
    path: "docs/adr/0001-use-postgres.md",
    blobSha: "blob-sha-1",
    ...overrides,
  };
}

describe("SummarySuggestionService", () => {
  it("cache hit returns the stored suggestion with zero provider calls (13.2)", async () => {
    const store = new SpyStore(new Map([["blob-sha-1", "Cached one-liner."]]));
    const provider = new SpyProvider(async () => "Fresh one-liner.");
    const service = new SummarySuggestionService(provider, store);

    const result = await service.suggest(makeAdr());

    expect(result).toEqual({ available: true, suggestion: "Cached one-liner." });
    expect(provider.calls).toHaveLength(0);
    expect(store.setCalls).toHaveLength(0);
  });

  it("cache miss generates from title/context/outcome, stores under blobSha, and returns it (13.1, 13.2)", async () => {
    const store = new SpyStore();
    const provider = new SpyProvider(async () => "Postgres chosen for durability.");
    const service = new SummarySuggestionService(provider, store);

    const result = await service.suggest(makeAdr());

    expect(result).toEqual({ available: true, suggestion: "Postgres chosen for durability." });
    expect(provider.calls).toEqual([
      {
        title: "Use Postgres",
        context: "We need a durable relational store.",
        outcome: "Chosen option: Postgres, because it fits.",
      },
    ]);
    expect(store.setCalls).toEqual([
      { blobSha: "blob-sha-1", summary: "Postgres chosen for durability." },
    ]);
    expect(store.get("blob-sha-1")).toBe("Postgres chosen for durability.");
  });

  it("provider error yields provider-error and caches nothing (13.5)", async () => {
    const store = new SpyStore();
    const provider = new SpyProvider(async () => {
      throw new Error("network down");
    });
    const service = new SummarySuggestionService(provider, store);

    const result = await service.suggest(makeAdr());

    expect(result).toEqual({ available: false, reason: "provider-error" });
    expect(store.setCalls).toHaveLength(0);
  });

  it("blank/whitespace generation is treated as provider-error and not cached", async () => {
    const store = new SpyStore();
    const provider = new SpyProvider(async () => "   \n\t ");
    const service = new SummarySuggestionService(provider, store);

    const result = await service.suggest(makeAdr());

    expect(result).toEqual({ available: false, reason: "provider-error" });
    expect(store.setCalls).toHaveLength(0);
  });

  it("null provider reports no-provider without touching the store at all (13.5)", async () => {
    const store = new SpyStore(new Map([["blob-sha-1", "Cached one-liner."]]));
    const service = new SummarySuggestionService(null, store);

    const result = await service.suggest(makeAdr());

    expect(result).toEqual({ available: false, reason: "no-provider" });
    expect(store.getCalls).toHaveLength(0);
    expect(store.setCalls).toHaveLength(0);
  });
});
