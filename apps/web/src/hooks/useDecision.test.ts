import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { Adr, CommitMeta, RelationView, SimilarityResult, UpdateAdrRequest } from "@adr/shared";
// Same relative-path rationale as `src/api/client.test.ts`: `@adr/api` is an
// app entrypoint without `exports`, reached via its `src/` inside the pnpm
// workspace for test-only use.
import { buildContainer, type Container } from "../../../api/src/container.js";
import { buildServer } from "../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../api/client.js";
import { createQueryClient } from "../state/queryClient.js";
import { createQueryWrapper } from "../test/queryWrapper.js";
import { useDecision } from "./useDecision.js";

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

function commit(sha: string): CommitMeta {
  return { sha, author: "a", date: "2026-01-01", message: "m" } as unknown as CommitMeta;
}

function similarity(id: string): SimilarityResult {
  return {
    adr: { id, title: `t-${id}`, status: "accepted", path: `${id}.md` },
    score: 0.5,
  } as unknown as SimilarityResult;
}

function adrWithPath(id: string, path: string): Adr {
  return { id, title: `t-${id}`, status: "accepted", path } as unknown as Adr;
}

describe("useDecision", () => {
  describe("against the real backend", () => {
    let repoPath: string;
    let container: Container;
    let app: FastifyInstance;
    let client: ApiClient;

    beforeEach(async () => {
      repoPath = await mkdtemp(join(tmpdir(), "adr-usedecision-"));
      const git = simpleGit(repoPath);
      await git.init();
      await git.addConfig("user.name", "Test Author");
      await git.addConfig("user.email", "test@example.com");
      container = buildContainer({
        repoPath,
        sqlitePath: join(repoPath, "test.sqlite"),
        gemini: { model: "fake-model", apiKey: "fake-key" },
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

    async function createAdrViaClient(title: string): Promise<Adr> {
      const result = await client.createAdr({ title, folder: "decisions", author: AUTHOR });
      if (!result.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      return result.adr;
    }

    async function saveAdr(
      id: string,
      title: string,
      baseBlobSha: string,
      relations?: UpdateAdrRequest["relations"],
    ): Promise<Adr> {
      const result = await client.updateAdr(id, {
        title,
        status: "accepted",
        date: "2026-01-01",
        contextAndProblemStatement: `${title} body.`,
        decisionOutcome: "Proceed.",
        decisionDrivers: "",
        consideredOptions: "",
        consequences: "",
        confirmation: "",
        prosAndConsOfTheOptions: "",
        moreInformation: "",
        additionalContent: "",
        author: AUTHOR,
        baseBlobSha,
        ...(relations ? { relations } : {}),
      });
      if (!result.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
      return result.adr;
    }

    it("returns all four typed datasets for a decision", async () => {
      const target = await createAdrViaClient("Decision target");
      const savedTarget = await saveAdr(target.id, "Decision target", target.blobSha);
      container.embeddingStore.set(savedTarget.blobSha, [1, 0, 0]);

      const source = await createAdrViaClient("Decision source");
      const savedSource = await saveAdr(source.id, "Decision source", source.blobSha, [
        { type: "supersedes", target: target.id },
      ]);
      container.embeddingStore.set(savedSource.blobSha, [0.9, 0.1, 0]);

      const { result } = renderHook(() => useDecision(client, target.id), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(
        () => {
          expect(result.current.adr.isPending).toBe(false);
          expect(result.current.relations.isPending).toBe(false);
          expect(result.current.history.isPending).toBe(false);
          expect(result.current.similar.isPending).toBe(false);
        },
        { timeout: 4000 },
      );

      expect(result.current.adr.isError).toBe(false);
      expect(result.current.relations.isError).toBe(false);
      expect(result.current.history.isError).toBe(false);
      expect(result.current.similar.isError).toBe(false);

      expect(result.current.adr.data?.id).toBe(target.id);
      expect(result.current.adr.data?.title).toBe("Decision target");
      expect(result.current.relations.data).toEqual([
        { type: "superseded-by", target: source.id, direction: "inbound" },
      ]);
      // create + save = at least two commits touching the file.
      expect(result.current.history.data?.length).toBeGreaterThanOrEqual(2);
      expect(typeof result.current.history.data?.[0].sha).toBe("string");
      expect(result.current.similar.data?.results).toHaveLength(1);
      expect(result.current.similar.data?.results[0].adr.id).toBe(source.id);
      expect(typeof result.current.similar.data?.results[0].score).toBe("number");
      // Embedding strategy never reports coverage.
      expect(result.current.similar.data?.coverage).toBeNull();
      expect(result.current.similar.errorStatus).toBeNull();
      expect(result.current.similar.isComparingAll).toBe(false);
    });
  });

  it("stays disabled with a null id: no fetches, undefined data", async () => {
    const getAdr = vi.fn();
    const getRelations = vi.fn();
    const getHistory = vi.fn();
    const getSimilar = vi.fn();
    const apiClient = makeStubClient({ getAdr, getRelations, getHistory, getSimilar });

    const { result } = renderHook(() => useDecision(apiClient, null), {
      wrapper: createQueryWrapper(),
    });

    // Give any (erroneously) enabled query a chance to run before asserting.
    await new Promise((r) => setTimeout(r, 20));
    expect(getAdr).not.toHaveBeenCalled();
    expect(getRelations).not.toHaveBeenCalled();
    expect(getHistory).not.toHaveBeenCalled();
    expect(getSimilar).not.toHaveBeenCalled();
    expect(result.current.adr.data).toBeUndefined();
    expect(result.current.relations.data).toBeUndefined();
    expect(result.current.history.data).toBeUndefined();
    expect(result.current.similar.data).toBeUndefined();
  });

  it("derives the similarity scope from the ADR's own folder and maps emptyScope to an empty list", async () => {
    const getAdr = vi
      .fn()
      .mockResolvedValue({ ok: true, adr: adrWithPath("adr-1", "team/platform/0001-foo.md") });
    const getRelations = vi.fn().mockResolvedValue({ ok: true, relations: [] });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [commit("s1")] });
    const getSimilar = vi.fn().mockResolvedValue({ ok: true, kind: "emptyScope" });
    const apiClient = makeStubClient({ getAdr, getRelations, getHistory, getSimilar });

    const { result } = renderHook(() => useDecision(apiClient, "adr-1"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.similar.isPending).toBe(false);
    });
    expect(getSimilar).toHaveBeenCalledWith("adr-1", "team/platform", { exhaustive: false });
    expect(result.current.similar.isError).toBe(false);
    expect(result.current.similar.data).toEqual({ results: [], coverage: null });
  });

  it("surfaces a non-ok result as a query error on the failing dataset only", async () => {
    const getAdr = vi
      .fn()
      .mockResolvedValue({ ok: true, adr: adrWithPath("adr-1", "decisions/0001-foo.md") });
    const getRelations = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [commit("s1")] });
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")], coverage: null });
    const apiClient = makeStubClient({ getAdr, getRelations, getHistory, getSimilar });

    const { result } = renderHook(() => useDecision(apiClient, "adr-1"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.relations.isError).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.adr.data?.id).toBe("adr-1");
      expect(result.current.history.data).toHaveLength(1);
      expect(result.current.similar.data?.results).toHaveLength(1);
    });
    expect(result.current.adr.isError).toBe(false);
    expect(result.current.history.isError).toBe(false);
    expect(result.current.similar.isError).toBe(false);
  });

  it("reads through the design's per-id keys, sharing history/similar with the existing hooks", () => {
    const queryClient = createQueryClient();
    const seededAdr = adrWithPath("adr-1", "decisions/0001-foo.md");
    const seededRelations: RelationView[] = [
      { type: "superseded-by", target: "adr-2", direction: "inbound" } as unknown as RelationView,
    ];
    const seededHistory = [commit("s1")];
    const seededSimilar = { results: [similarity("adr-2")], coverage: null };
    queryClient.setQueryData(["adr", "adr-1"], seededAdr);
    queryClient.setQueryData(["relations", "adr-1"], seededRelations);
    // These two are exactly the keys `useInspectorPreviews` uses (history is
    // keyed by id; similar carries the folder slot, null = own-folder scope).
    queryClient.setQueryData(["history", "adr-1"], seededHistory);
    queryClient.setQueryData(["similar", "adr-1", null], seededSimilar);
    // Never-resolving fetches: any data shown must come from the seeded keys.
    const pending = (): Promise<never> => new Promise(() => {});
    const apiClient = makeStubClient({
      getAdr: vi.fn().mockImplementation(pending),
      getRelations: vi.fn().mockImplementation(pending),
      getHistory: vi.fn().mockImplementation(pending),
      getSimilar: vi.fn().mockImplementation(pending),
    });

    const { result } = renderHook(() => useDecision(apiClient, "adr-1"), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current.adr.data).toEqual(seededAdr);
    expect(result.current.relations.data).toEqual(seededRelations);
    expect(result.current.history.data).toEqual(seededHistory);
    expect(result.current.similar.data).toEqual(seededSimilar);
  });
  describe("similar: error status, compare-all and retry", () => {
    function okClient(getSimilar: ApiClient["getSimilar"]): ApiClient {
      return makeStubClient({
        getAdr: vi
          .fn()
          .mockImplementation(async (id: string) => ({
            ok: true,
            adr: adrWithPath(id, `decisions/${id}.md`),
          })),
        getRelations: vi.fn().mockResolvedValue({ ok: true, relations: [] }),
        getHistory: vi.fn().mockResolvedValue({ ok: true, history: [] }),
        getSimilar,
      });
    }

    function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => {
        resolve = r;
      });
      return { promise, resolve };
    }

    it("exposes the failure flag and HTTP status without retrying automatically", async () => {
      const getSimilar = vi.fn().mockResolvedValue({ ok: false, status: 503 });
      const { result } = renderHook(() => useDecision(okClient(getSimilar), "adr-1"), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.similar.isError).toBe(true);
      });
      expect(result.current.similar.errorStatus).toBe(503);
      expect(result.current.similar.data).toBeUndefined();
      // App-wide `retry: false` stays: exactly one request.
      expect(getSimilar).toHaveBeenCalledTimes(1);
    });

    it("reports status 0 for a network failure", async () => {
      const getSimilar = vi.fn().mockResolvedValue({ ok: false, status: 0 });
      const { result } = renderHook(() => useDecision(okClient(getSimilar), "adr-1"), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.similar.isError).toBe(true);
      });
      expect(result.current.similar.errorStatus).toBe(0);
    });

    it("retry() refetches the active query and clears the failure on success", async () => {
      const getSimilar = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503 })
        .mockResolvedValueOnce({
          ok: true,
          kind: "ranked",
          results: [similarity("adr-2")],
          coverage: { judged: 1, total: 1 },
        });
      const { result } = renderHook(() => useDecision(okClient(getSimilar), "adr-1"), {
        wrapper: createQueryWrapper(),
      });

      await waitFor(() => {
        expect(result.current.similar.errorStatus).toBe(503);
      });

      act(() => result.current.similar.retry());

      await waitFor(() => {
        expect(result.current.similar.isError).toBe(false);
        expect(result.current.similar.data?.results).toHaveLength(1);
      });
      expect(result.current.similar.errorStatus).toBeNull();
      expect(result.current.similar.data?.coverage).toEqual({ judged: 1, total: 1 });
      expect(getSimilar).toHaveBeenCalledTimes(2);
      expect(getSimilar).toHaveBeenLastCalledWith("adr-1", "decisions", { exhaustive: false });
    });

    it("compareAll() requests an exhaustive comparison, keeps the capped data while pending, then replaces it", async () => {
      const exhaustive = deferred<unknown>();
      const capped = {
        ok: true,
        kind: "ranked",
        results: [similarity("adr-2")],
        coverage: { judged: 1, total: 3 },
      };
      const full = {
        ok: true,
        kind: "ranked",
        results: [similarity("adr-2"), similarity("adr-3"), similarity("adr-4")],
        coverage: { judged: 3, total: 3 },
      };
      const getSimilar = vi
        .fn()
        .mockImplementation((_id: string, _scope: string, options?: { exhaustive?: boolean }) =>
          options?.exhaustive ? exhaustive.promise : Promise.resolve(capped),
        );
      const queryClient = createQueryClient();
      const { result } = renderHook(() => useDecision(okClient(getSimilar), "adr-1"), {
        wrapper: wrapperFor(queryClient),
      });

      await waitFor(() => {
        expect(result.current.similar.data?.coverage).toEqual({ judged: 1, total: 3 });
      });
      expect(result.current.similar.isComparingAll).toBe(false);

      act(() => result.current.similar.compareAll());

      await waitFor(() => {
        expect(result.current.similar.isComparingAll).toBe(true);
      });
      expect(getSimilar).toHaveBeenLastCalledWith("adr-1", "decisions", { exhaustive: true });
      // The capped list stays visible during the long comparison.
      expect(result.current.similar.data?.results).toHaveLength(1);
      expect(result.current.similar.isPending).toBe(false);

      exhaustive.resolve(full);

      await waitFor(() => {
        expect(result.current.similar.isComparingAll).toBe(false);
        expect(result.current.similar.data?.results).toHaveLength(3);
      });
      expect(result.current.similar.data?.coverage).toEqual({ judged: 3, total: 3 });
      // Both keys sit under the `["similar", id]` prefix useComposeSave invalidates.
      expect(queryClient.getQueryData(["similar", "adr-1", null])).toEqual({
        results: capped.results,
        coverage: capped.coverage,
      });
      expect(queryClient.getQueryData(["similar", "adr-1", null, "exhaustive"])).toEqual({
        results: full.results,
        coverage: full.coverage,
      });
      expect(queryClient.getQueryCache().findAll({ queryKey: ["similar", "adr-1"] })).toHaveLength(2);
    });

    it("retry() after a failed exhaustive comparison repeats the exhaustive request", async () => {
      const getSimilar = vi
        .fn()
        .mockImplementation(async (_id: string, _scope: string, options?: { exhaustive?: boolean }) =>
          options?.exhaustive
            ? { ok: false, status: 503 }
            : { ok: true, kind: "ranked", results: [similarity("adr-2")], coverage: { judged: 1, total: 2 } },
        );
      const { result } = renderHook(() => useDecision(okClient(getSimilar), "adr-1"), {
        wrapper: createQueryWrapper(),
      });
      await waitFor(() => {
        expect(result.current.similar.data?.results).toHaveLength(1);
      });

      act(() => result.current.similar.compareAll());
      await waitFor(() => {
        expect(result.current.similar.errorStatus).toBe(503);
      });
      // The failure replaces the capped list.
      expect(result.current.similar.data).toBeUndefined();
      expect(result.current.similar.isComparingAll).toBe(false);
      const callsBefore = getSimilar.mock.calls.length;

      act(() => result.current.similar.retry());
      await waitFor(() => {
        expect(getSimilar.mock.calls.length).toBe(callsBefore + 1);
      });
      expect(getSimilar).toHaveBeenLastCalledWith("adr-1", "decisions", { exhaustive: true });
    });

    it("resets the compare-all flag when the viewed ADR changes", async () => {
      const getSimilar = vi
        .fn()
        .mockImplementation(async (id: string) => ({
          ok: true,
          kind: "ranked",
          results: [similarity(`${id}-peer`)],
          coverage: { judged: 1, total: 2 },
        }));
      const { result, rerender } = renderHook(
        ({ id }: { id: string }) => useDecision(okClient(getSimilar), id),
        { wrapper: createQueryWrapper(), initialProps: { id: "adr-1" } },
      );
      await waitFor(() => {
        expect(result.current.similar.data?.results).toHaveLength(1);
      });

      act(() => result.current.similar.compareAll());
      await waitFor(() => {
        expect(getSimilar).toHaveBeenLastCalledWith("adr-1", "decisions", { exhaustive: true });
      });

      rerender({ id: "adr-2" });
      await waitFor(() => {
        expect(result.current.similar.data?.results[0]?.adr.id).toBe("adr-2-peer");
      });
      expect(getSimilar).toHaveBeenLastCalledWith("adr-2", "decisions", { exhaustive: false });
      expect(result.current.similar.isComparingAll).toBe(false);

      // Coming back to the first ADR starts capped again.
      rerender({ id: "adr-1" });
      await waitFor(() => {
        expect(result.current.similar.data?.results[0]?.adr.id).toBe("adr-1-peer");
      });
      expect(getSimilar).not.toHaveBeenCalledWith("adr-2", "decisions", { exhaustive: true });
      expect(result.current.similar.isComparingAll).toBe(false);
    });
  });
});
