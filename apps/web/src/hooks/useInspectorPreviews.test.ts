import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Adr, CommitMeta, SimilarityResult } from "@adr/shared";
import type { ApiClient } from "../api/client.js";
import { createQueryWrapper } from "../test/queryWrapper.js";
import { useInspectorPreviews } from "./useInspectorPreviews.js";

/**
 * Builds a stub `ApiClient` where only the methods this hook touches
 * (`getSimilar`, `getHistory`, `getAdr`) are implemented. Every other method
 * throws if called, so a test fails loudly if the hook reaches beyond its
 * contract. Each relevant method is a `vi.fn` so call-counts can be asserted
 * (e.g. "no fetch happens when disabled").
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

describe("useInspectorPreviews", () => {
  it("performs no fetch and exposes undefined data when enabled is false", async () => {
    const getSimilar = vi.fn();
    const getHistory = vi.fn();
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, "adr-1", "team/platform", false),
      { wrapper: createQueryWrapper() },
    );

    // Give any (erroneously) enabled query a chance to run before asserting.
    await new Promise((r) => setTimeout(r, 20));
    expect(getSimilar).not.toHaveBeenCalled();
    expect(getHistory).not.toHaveBeenCalled();
    expect(getAdr).not.toHaveBeenCalled();
    expect(result.current.similar.data).toBeUndefined();
    expect(result.current.history.data).toBeUndefined();
  });

  it("performs no fetch and exposes undefined data when adrId is null (even if enabled)", async () => {
    const getSimilar = vi.fn();
    const getHistory = vi.fn();
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, null, null, true),
      { wrapper: createQueryWrapper() },
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(getSimilar).not.toHaveBeenCalled();
    expect(getHistory).not.toHaveBeenCalled();
    expect(getAdr).not.toHaveBeenCalled();
    expect(result.current.similar.data).toBeUndefined();
    expect(result.current.history.data).toBeUndefined();
  });

  it("populates similar + history previews from resolved results when enabled (folder as scope)", async () => {
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x"), similarity("y")] });
    const getHistory = vi
      .fn()
      .mockResolvedValue({ ok: true, history: [commit("s1"), commit("s2")] });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, "adr-1", "team/platform", true),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.similar.isPending).toBe(false);
      expect(result.current.history.isPending).toBe(false);
    });

    expect(result.current.similar.isError).toBe(false);
    expect(result.current.history.isError).toBe(false);
    expect(result.current.similar.data).toHaveLength(2);
    expect(result.current.history.data).toHaveLength(2);
    // folder is non-null so the ADR's own folder is never derived.
    expect(getAdr).not.toHaveBeenCalled();
    expect(getSimilar).toHaveBeenCalledWith("adr-1", "team/platform");
    expect(getHistory).toHaveBeenCalledWith("adr-1");
  });

  it("derives the similarity scope from the ADR's own folder when folder is null", async () => {
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")] });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [commit("s1")] });
    const getAdr = vi
      .fn()
      .mockResolvedValue({ ok: true, adr: adrWithPath("adr-1", "team/platform/0001-foo.md") });
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, "adr-1", null, true),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.similar.isPending).toBe(false);
    });
    expect(getAdr).toHaveBeenCalledWith("adr-1");
    expect(getSimilar).toHaveBeenCalledWith("adr-1", "team/platform");
  });

  it("treats offline emptyScope similarity as an empty (not error) preview", async () => {
    const getSimilar = vi.fn().mockResolvedValue({ ok: true, kind: "emptyScope" });
    const getHistory = vi.fn().mockResolvedValue({ ok: true, history: [commit("s1")] });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, "adr-1", "scope", true),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.similar.isPending).toBe(false);
    });
    expect(result.current.similar.isError).toBe(false);
    expect(result.current.similar.data).toEqual([]);
  });

  it("surfaces isError on a failing history query without throwing", async () => {
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")] });
    const getHistory = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, "adr-1", "scope", true),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.history.isError).toBe(true);
    });
    // The similar preview is unaffected and still resolves.
    await waitFor(() => {
      expect(result.current.similar.data).toHaveLength(1);
    });
    expect(result.current.similar.isError).toBe(false);
  });

  it("surfaces isError when the history query rejects (network error) without throwing", async () => {
    const getSimilar = vi
      .fn()
      .mockResolvedValue({ ok: true, kind: "ranked", results: [similarity("x")] });
    const getHistory = vi.fn().mockRejectedValue(new Error("network down"));
    const getAdr = vi.fn();
    const apiClient = makeStubClient({ getSimilar, getHistory, getAdr });

    const { result } = renderHook(
      () => useInspectorPreviews(apiClient, "adr-1", "scope", true),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.history.isError).toBe(true);
    });
  });
});
