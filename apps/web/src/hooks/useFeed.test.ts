import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { FeedCard } from "@adr/shared";
// Same relative-path rationale as `src/api/client.test.ts`: `@adr/api` is an
// app entrypoint without `exports`, reached via its `src/` inside the pnpm
// workspace for test-only use.
import { buildContainer, type Container } from "../../../api/src/container.js";
import { buildServer } from "../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../api/client.js";
import { createQueryClient } from "../state/queryClient.js";
import { createQueryWrapper } from "../test/queryWrapper.js";
import { useFeed } from "./useFeed.js";

const AUTHOR = "Test Author <test@example.com>";

/**
 * Stub `ApiClient` where only overridden methods are callable; every other
 * method throws so a test fails loudly if the hook reaches beyond its
 * contract (same pattern as `useInspectorPreviews.test.ts`).
 */
function makeStubClient(overrides: Partial<ApiClient>): ApiClient {
  const unexpected =
    (name: string) =>
    (): never => {
      throw new Error(`unexpected ApiClient.${name} call`);
    };
  const base = {
    createAdr: unexpected("createAdr"),
    getAdr: unexpected("getAdr"),
    updateAdr: unexpected("updateAdr"),
    getRelations: unexpected("getRelations"),
    createFolder: unexpected("createFolder"),
    moveAdr: unexpected("moveAdr"),
    getTree: unexpected("getTree"),
    getHistory: unexpected("getHistory"),
    getVersionAt: unexpected("getVersionAt"),
    getVersionDiff: unexpected("getVersionDiff"),
    compareAdrs: unexpected("compareAdrs"),
    search: unexpected("search"),
    getSimilar: unexpected("getSimilar"),
    getFeed: unexpected("getFeed"),
    getRawAdr: unexpected("getRawAdr"),
    getSummarySuggestion: unexpected("getSummarySuggestion"),
  } as unknown as ApiClient;
  return { ...base, ...overrides };
}

/** Wrapper around a caller-owned QueryClient so tests can pre-seed the cache. */
function wrapperFor(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }): JSX.Element {
    return createElement(QueryClientProvider, { client: queryClient }, children) as JSX.Element;
  };
}

function feedCard(id: string, title: string): FeedCard {
  return {
    id,
    title,
    status: "proposed",
    path: `decisions/${id}.md`,
    topic: "decisions",
    date: "2026-01-01",
    decisionMakers: [],
    consulted: [],
    informed: [],
    shortDescription: { text: `About ${title}.`, source: "derived" },
  };
}

describe("useFeed", () => {
  describe("against the real backend", () => {
    let repoPath: string;
    let app: FastifyInstance;
    let client: ApiClient;

    beforeEach(async () => {
      repoPath = await mkdtemp(join(tmpdir(), "adr-usefeed-"));
      const git = simpleGit(repoPath);
      await git.init();
      await git.addConfig("user.name", "Test Author");
      await git.addConfig("user.email", "test@example.com");
      const container: Container = buildContainer({
        repoPath,
        sqlitePath: join(repoPath, "test.sqlite"),
        gemini: { model: "fake-model", apiKey: "" },
      });
      await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
      app = await buildServer(container);
      const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
      client = createApiClient(baseUrl);
    });

    afterEach(async () => {
      await app.close();
      await rm(repoPath, { recursive: true, force: true });
    });

    it("returns typed feed cards over a seeded repo", async () => {
      const a = await client.createAdr({ title: "Feed hook A", folder: "decisions", author: AUTHOR });
      const b = await client.createAdr({ title: "Feed hook B", folder: "decisions", author: AUTHOR });
      if (!a.ok || !b.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      const { result } = renderHook(() => useFeed(client), { wrapper: createQueryWrapper() });

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
      expect(result.current.isError).toBe(false);
      const cards = result.current.data;
      if (!cards) throw new Error("expected feed cards");
      expect(cards).toHaveLength(2);
      const card = cards.find((c) => c.id === a.adr.id);
      if (!card) throw new Error("expected a card for the first seeded ADR");
      expect(card.title).toBe("Feed hook A");
      expect(card.status).toBe("proposed");
      expect(card.topic).toBe("decisions");
      expect(typeof card.shortDescription.text).toBe("string");
      expect(["summary", "derived"]).toContain(card.shortDescription.source);
      expect(cards.some((c) => c.id === b.adr.id)).toBe(true);
    });
  });

  it("surfaces a non-ok result as a query error", async () => {
    const getFeed = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const apiClient = makeStubClient({ getFeed });

    const { result } = renderHook(() => useFeed(apiClient), { wrapper: createQueryWrapper() });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.data).toBeUndefined();
  });

  it('reads through the design\'s ["feed"] cache key', () => {
    const queryClient = createQueryClient();
    const seeded = [feedCard("adr-1", "Seeded card")];
    queryClient.setQueryData(["feed"], seeded);
    // Never-resolving fetch: any data shown must come from the seeded key.
    const getFeed = vi.fn().mockReturnValue(new Promise(() => {}));
    const apiClient = makeStubClient({ getFeed });

    const { result } = renderHook(() => useFeed(apiClient), { wrapper: wrapperFor(queryClient) });

    expect(result.current.data).toEqual(seeded);
  });
});
