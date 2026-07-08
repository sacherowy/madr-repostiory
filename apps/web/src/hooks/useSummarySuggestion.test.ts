import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { Adr, SummarySuggestionResult } from "@adr/shared";
// Same relative-path rationale as `src/api/client.test.ts`: `@adr/api` is an
// app entrypoint without `exports`, reached via its `src/` inside the pnpm
// workspace for test-only use.
import { buildContainer, type Container } from "../../../api/src/container.js";
import { buildServer } from "../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../api/client.js";
import { createQueryClient } from "../state/queryClient.js";
import { createQueryWrapper } from "../test/queryWrapper.js";
import { useSummarySuggestion } from "./useSummarySuggestion.js";

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

interface Backend {
  repoPath: string;
  container: Container;
  app: FastifyInstance;
  client: ApiClient;
}

async function startBackend(apiKey: string): Promise<Backend> {
  const repoPath = await mkdtemp(join(tmpdir(), "adr-usesummary-"));
  const git = simpleGit(repoPath);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  const container = buildContainer({
    repoPath,
    sqlitePath: join(repoPath, "test.sqlite"),
    gemini: { model: "fake-model", apiKey },
  });
  await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
  const app = await buildServer(container);
  const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
  return { repoPath, container, app, client: createApiClient(baseUrl) };
}

async function stopBackend(backend: Backend): Promise<void> {
  await backend.app.close();
  await rm(backend.repoPath, { recursive: true, force: true });
}

async function createAdrViaClient(client: ApiClient, title: string): Promise<Adr> {
  const result = await client.createAdr({ title, folder: "decisions", author: AUTHOR });
  if (!result.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
  return result.adr;
}

describe("useSummarySuggestion", () => {
  describe("against the real offline backend (no API key)", () => {
    let backend: Backend;

    beforeEach(async () => {
      backend = await startBackend("");
    });

    afterEach(async () => {
      await stopBackend(backend);
    });

    it("returns the unavailable variant with reason no-provider", async () => {
      const created = await createAdrViaClient(backend.client, "Offline suggestion ADR");

      const { result } = renderHook(
        () => useSummarySuggestion(backend.client, created.id, created.blobSha, true),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toEqual({ available: false, reason: "no-provider" });
    });
  });

  describe("against the real backend with a cached suggestion", () => {
    let backend: Backend;

    beforeEach(async () => {
      backend = await startBackend("fake-key");
    });

    afterEach(async () => {
      await stopBackend(backend);
    });

    it("returns the available variant from the cache without touching the provider", async () => {
      const created = await createAdrViaClient(backend.client, "Cached suggestion ADR");
      // Pre-seed the real SqliteSummaryStore for this blob sha so the wired
      // provider (fake creds) is never reached — mirrors the `seedVector`
      // pattern in `src/api/client.test.ts`.
      backend.container.summaryStore.set(created.blobSha, "One cached sentence.");

      const { result } = renderHook(
        () => useSummarySuggestion(backend.client, created.id, created.blobSha, true),
        { wrapper: createQueryWrapper() },
      );

      await waitFor(() => {
        expect(result.current.isPending).toBe(false);
      });
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toEqual({ available: true, suggestion: "One cached sentence." });
    });
  });

  it("does not fire when enabled is false", async () => {
    const getSummarySuggestion = vi.fn();
    const apiClient = makeStubClient({ getSummarySuggestion });

    const { result } = renderHook(
      () => useSummarySuggestion(apiClient, "adr-1", "sha-1", false),
      { wrapper: createQueryWrapper() },
    );

    // Give any (erroneously) enabled query a chance to run before asserting.
    await new Promise((r) => setTimeout(r, 20));
    expect(getSummarySuggestion).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("does not fire while id or blobSha is null (even if enabled)", async () => {
    const getSummarySuggestion = vi.fn();
    const apiClient = makeStubClient({ getSummarySuggestion });

    const first = renderHook(() => useSummarySuggestion(apiClient, null, "sha-1", true), {
      wrapper: createQueryWrapper(),
    });
    const second = renderHook(() => useSummarySuggestion(apiClient, "adr-1", null, true), {
      wrapper: createQueryWrapper(),
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(getSummarySuggestion).not.toHaveBeenCalled();
    expect(first.result.current.data).toBeUndefined();
    expect(second.result.current.data).toBeUndefined();
  });

  it("surfaces a non-ok result as a query error", async () => {
    const getSummarySuggestion = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const apiClient = makeStubClient({ getSummarySuggestion });

    const { result } = renderHook(
      () => useSummarySuggestion(apiClient, "adr-1", "sha-1", true),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.data).toBeUndefined();
  });

  it('reads through the design\'s ["summary-suggestion", id, blobSha] cache key', () => {
    const queryClient = createQueryClient();
    const seeded: SummarySuggestionResult = { available: true, suggestion: "Seeded sentence." };
    queryClient.setQueryData(["summary-suggestion", "adr-1", "sha-1"], seeded);
    // Never-resolving fetch: any data shown must come from the seeded key.
    const getSummarySuggestion = vi.fn().mockReturnValue(new Promise(() => {}));
    const apiClient = makeStubClient({ getSummarySuggestion });

    const { result } = renderHook(
      () => useSummarySuggestion(apiClient, "adr-1", "sha-1", true),
      { wrapper: wrapperFor(queryClient) },
    );

    expect(result.current.data).toEqual(seeded);
  });
});
