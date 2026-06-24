import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type {
  Adr,
  CommitMeta,
  RelationView,
  SimilarityResult,
} from "@adr/shared";
import type { ApiClient } from "../api/client.js";
import { createQueryWrapper } from "../test/queryWrapper.js";
import { useAspectCounts } from "./useAspectCounts.js";

/**
 * Builds a stub `ApiClient` where only the methods this hook touches
 * (`getRelations`, `getHistory`, `getSimilar`, `getAdr`) are implemented. Every
 * other method throws if called, so a test fails loudly if the hook reaches
 * beyond its contract. Each relevant method is a `vi.fn` so call-counts can be
 * asserted (e.g. "no fetch happens when adrId is null").
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
  } as unknown as ApiClient;
  return { ...base, ...overrides };
}

function relation(id: string): RelationView {
  return {
    type: "supersedes",
    target: { id, title: `t-${id}`, status: "accepted", path: `${id}.md` },
  } as unknown as RelationView;
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

describe("useAspectCounts", () => {
  it("returns {} and performs no fetch when adrId is null", async () => {
    const getRelations = vi.fn();
    const getHistory = vi.fn();
    const getSimilar = vi.fn();
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    const { result } = renderHook(() => useAspectCounts(apiClient, null, null), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current).toEqual({});
    // Give any (erroneously) enabled query a chance to run before asserting.
    await new Promise((r) => setTimeout(r, 20));
    expect(getRelations).not.toHaveBeenCalled();
    expect(getHistory).not.toHaveBeenCalled();
    expect(getSimilar).not.toHaveBeenCalled();
    expect(getAdr).not.toHaveBeenCalled();
    expect(result.current).toEqual({});
  });

  it("populates relations/history/similar counts from resolved results (folder provided as scope)", async () => {
    const getRelations = vi
      .fn()
      .mockResolvedValue({ ok: true, relations: [relation("a"), relation("b")] });
    const getHistory = vi
      .fn()
      .mockResolvedValue({ ok: true, history: [commit("s1"), commit("s2"), commit("s3")] });
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")] });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    const { result } = renderHook(() => useAspectCounts(apiClient, "adr-1", "team/platform"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current).toEqual({ relations: 2, history: 3, similar: 1 });
    });

    // folder is non-null so the ADR's own folder is never derived.
    expect(getAdr).not.toHaveBeenCalled();
    expect(getSimilar).toHaveBeenCalledWith("adr-1", "team/platform");
  });

  it("derives the similarity scope from the ADR's own folder when folder is null", async () => {
    const getRelations = vi.fn().mockResolvedValue({ ok: true, relations: [] });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [] });
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x"), similarity("y")] });
    const getAdr = vi
      .fn()
      .mockResolvedValue({ ok: true, adr: adrWithPath("adr-1", "team/platform/0001-foo.md") });
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    const { result } = renderHook(() => useAspectCounts(apiClient, "adr-1", null), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.similar).toBe(2);
    });
    expect(getAdr).toHaveBeenCalledWith("adr-1");
    // scope = path up to the last "/"
    expect(getSimilar).toHaveBeenCalledWith("adr-1", "team/platform");
    expect(result.current).toEqual({ relations: 0, history: 0, similar: 2 });
  });

  it("uses '.' as scope when the ADR path has no containing folder", async () => {
    const getRelations = vi.fn().mockResolvedValue({ ok: true, relations: [] });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [] });
    const getSimilar = vi.fn().mockResolvedValue({ ok: true, kind: "ranked", results: [] });
    const getAdr = vi
      .fn()
      .mockResolvedValue({ ok: true, adr: adrWithPath("adr-1", "0001-foo.md") });
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    renderHook(() => useAspectCounts(apiClient, "adr-1", null), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(getSimilar).toHaveBeenCalled();
    });
    expect(getSimilar).toHaveBeenCalledWith("adr-1", ".");
  });

  it("omits a key when its query returns a non-ok result, without throwing", async () => {
    const getRelations = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [commit("s1")] });
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")] });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    const { result } = renderHook(() => useAspectCounts(apiClient, "adr-1", "scope"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.history).toBe(1);
      expect(result.current.similar).toBe(1);
    });
    expect(result.current).not.toHaveProperty("relations");
    expect(result.current).toEqual({ history: 1, similar: 1 });
  });

  it("omits a key when its query rejects (network error), without throwing", async () => {
    const getRelations = vi.fn().mockResolvedValue({ ok: true, relations: [relation("a")] });
    const getHistory = vi.fn().mockRejectedValue(new Error("network down"));
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")] });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    const { result } = renderHook(() => useAspectCounts(apiClient, "adr-1", "scope"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.relations).toBe(1);
      expect(result.current.similar).toBe(1);
    });
    expect(result.current).not.toHaveProperty("history");
  });

  it("omits similar when similarity resolves to emptyScope (offline), without throwing", async () => {
    const getRelations = vi.fn().mockResolvedValue({ ok: true, relations: [relation("a")] });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [commit("s1")] });
    const getSimilar = vi.fn().mockResolvedValue({ ok: true, kind: "emptyScope" });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getRelations, getHistory, getSimilar, getAdr });

    const { result } = renderHook(() => useAspectCounts(apiClient, "adr-1", "scope"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.relations).toBe(1);
      expect(result.current.history).toBe(1);
    });
    expect(result.current).not.toHaveProperty("similar");
    expect(result.current).toEqual({ relations: 1, history: 1 });
  });
});
