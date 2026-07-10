import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import { SummarySuggestionService, type SummaryProvider } from "@adr/core";
import { buildContainer, type Container } from "../container.js";
import { summariesRoutes } from "./summaries.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-routes-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

const RAW_ADR = [
  "---",
  "id: adr-0001",
  "status: proposed",
  'date: "2026-01-01"',
  "---",
  "# Seeded decision",
  "",
  "## Context and Problem Statement",
  "We must pick a database.",
  "",
  "## Decision Outcome",
  'Chosen option: "PostgreSQL", because it fits.',
  "",
].join("\n");

/** Counting SummaryProvider test double: real SqliteSummaryStore + this stub
 * prove the route's cache path with zero network I/O. */
class CountingProvider implements SummaryProvider {
  calls = 0;
  async generateSummary(): Promise<string> {
    this.calls += 1;
    return "A generated one-sentence suggestion.";
  }
}

class ThrowingProvider implements SummaryProvider {
  async generateSummary(): Promise<string> {
    throw new Error("provider exploded");
  }
}

describe("summariesRoutes", () => {
  let repoPath: string;
  let container: Container;

  beforeEach(async () => {
    repoPath = await initRepo();
    // Blank API key: buildContainer must select NO summary provider (null),
    // mirroring the embeddings selection (design: GeminiSummaryProvider /
    // SqliteSummaryStore implementation notes; req 13.5).
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });

    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
    await container.git.writeAndCommit("decisions/0001-seeded.md", RAW_ADR, "seed adr", AUTHOR);
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  async function buildApp(c: Container): Promise<FastifyInstance> {
    const app = Fastify();
    await app.register(summariesRoutes, { container: c });
    await app.ready();
    return app;
  }

  /** Same container, but with the suggestion pipeline re-composed around an
   * injected provider double and the container's REAL SqliteSummaryStore —
   * the Container type is a plain interface, so this is the least invasive
   * seam (no production code changes needed). */
  function withProvider(provider: SummaryProvider): Container {
    return {
      ...container,
      summaryProvider: provider,
      summarySuggestion: new SummarySuggestionService(provider, container.summaryStore),
    };
  }

  describe("GET /api/adrs/:id/summary-suggestion", () => {
    it("returns HTTP 200 with the no-provider variant when no API key is configured (req 13.5)", async () => {
      const app = await buildApp(container);

      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-0001/summary-suggestion",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ available: false, reason: "no-provider" });

      await app.close();
    });

    it("returns 404 for an unknown ADR id", async () => {
      const app = await buildApp(container);

      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-9999/summary-suggestion",
      });

      expect(res.statusCode).toBe(404);

      await app.close();
    });

    it("serves the second identical request from the SQLite cache with zero additional provider calls (req 13.1, 13.2)", async () => {
      const provider = new CountingProvider();
      const app = await buildApp(withProvider(provider));

      const first = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-0001/summary-suggestion",
      });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({
        available: true,
        suggestion: "A generated one-sentence suggestion.",
      });
      expect(provider.calls).toBe(1);

      const second = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-0001/summary-suggestion",
      });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual({
        available: true,
        suggestion: "A generated one-sentence suggestion.",
      });
      // Cache hit on the unchanged blob SHA: the provider was NOT called again.
      expect(provider.calls).toBe(1);

      await app.close();
    });

    it("returns HTTP 200 (not 5xx) with the provider-error variant when the provider throws (req 13.5)", async () => {
      const app = await buildApp(withProvider(new ThrowingProvider()));

      const res = await app.inject({
        method: "GET",
        url: "/api/adrs/adr-0001/summary-suggestion",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ available: false, reason: "provider-error" });

      await app.close();
    });
  });
});
