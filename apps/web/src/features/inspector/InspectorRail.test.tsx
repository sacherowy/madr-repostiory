import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommitMeta, SimilarityResult } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { InspectorRail } from "./InspectorRail.js";

/**
 * Builds a stub `ApiClient` where only the methods the inspector previews touch
 * (`getSimilar`, `getHistory`, `getAdr`) are provided. Every other method throws
 * if called, so a test fails loudly if the component reaches beyond its
 * contract. This mirrors `useInspectorPreviews.test.ts`'s own stub so the rail
 * is exercised backend-free.
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
  return { sha, author: "alice", date: "2026-01-01", message: `msg ${sha}` };
}

function similarity(id: string): SimilarityResult {
  return {
    adr: { id, title: `t-${id}`, status: "accepted", path: `${id}.md` },
    score: 0.5,
  };
}

interface Overrides {
  similar?: SimilarityResult[] | "emptyScope";
  history?: CommitMeta[];
}

function rankedSimilar(results: SimilarityResult[]) {
  return vi.fn().mockResolvedValue({ ok: true, kind: "ranked", results });
}

function makeClient(o: Overrides): ApiClient {
  const getSimilar =
    o.similar === "emptyScope"
      ? vi.fn().mockResolvedValue({ ok: true, kind: "emptyScope" })
      : rankedSimilar(o.similar ?? []);
  const getHistory = vi.fn().mockResolvedValue({ ok: true, history: o.history ?? [] });
  const getAdr = vi.fn();
  return makeStubClient({ getSimilar, getHistory, getAdr });
}

const noop = (): void => {};

afterEach(() => {
  cleanup();
});

describe("InspectorRail", () => {
  it("is collapsed by default (open=false): renders the toggle but no previews", () => {
    const apiClient = makeClient({ similar: [similarity("x")], history: [commit("s1")] });
    const onToggle = vi.fn();

    render(
      <InspectorRail
        apiClient={apiClient}
        adrId="adr-1"
        folder="team/platform"
        open={false}
        onToggle={onToggle}
        onOpenAspect={noop}
      />,
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByTestId("inspector-rail")).toBeTruthy();
    expect(screen.queryByTestId("inspector-similar")).toBeNull();
    expect(screen.queryByTestId("inspector-history")).toBeNull();

    const toggle = screen.getByTestId("inspector-toggle");
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("open + selected: renders the Similar preview with similarity meters and the history preview", async () => {
    const apiClient = makeClient({
      similar: [similarity("x"), similarity("y")],
      history: [commit("s1"), commit("s2")],
    });

    render(
      <InspectorRail
        apiClient={apiClient}
        adrId="adr-1"
        folder="team/platform"
        open={true}
        onToggle={noop}
        onOpenAspect={noop}
      />,
      { wrapper: createQueryWrapper() },
    );

    // SimilarityMeter renders the score formatted to two decimals as `.meter__value`.
    await waitFor(() => {
      const meters = screen.getByTestId("inspector-similar").querySelectorAll(".meter__value");
      expect(meters.length).toBe(2);
    });
    const meters = screen.getByTestId("inspector-similar").querySelectorAll(".meter__value");
    expect(meters[0].textContent).toBe("0.50");

    await waitFor(() => {
      const history = screen.getByTestId("inspector-history");
      expect(history.textContent).toContain("msg s1");
    });
    const history = screen.getByTestId("inspector-history");
    expect(history.textContent).toContain("msg s2");
  });

  it("open + selected + emptyScope similarity: shows the EMPTY state, not an error", async () => {
    const apiClient = makeClient({ similar: "emptyScope", history: [commit("s1")] });

    render(
      <InspectorRail
        apiClient={apiClient}
        adrId="adr-1"
        folder="scope"
        open={true}
        onToggle={noop}
        onOpenAspect={noop}
      />,
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByTestId("inspector-similar-empty")).toBeTruthy();
    });
    expect(screen.queryByTestId("inspector-similar-error")).toBeNull();
    // No meters rendered for an empty scope.
    expect(
      screen.getByTestId("inspector-similar").querySelectorAll(".meter__value").length,
    ).toBe(0);
  });

  it("activating the similar view-all calls onOpenAspect('similar'); history view-all calls onOpenAspect('history')", async () => {
    const apiClient = makeClient({
      similar: [similarity("x")],
      history: [commit("s1")],
    });
    const onOpenAspect = vi.fn();

    render(
      <InspectorRail
        apiClient={apiClient}
        adrId="adr-1"
        folder="scope"
        open={true}
        onToggle={noop}
        onOpenAspect={onOpenAspect}
      />,
      { wrapper: createQueryWrapper() },
    );

    const similarViewAll = await screen.findByTestId("inspector-similar-view-all");
    fireEvent.click(similarViewAll);
    expect(onOpenAspect).toHaveBeenCalledWith("similar");

    const historyViewAll = await screen.findByTestId("inspector-history-view-all");
    fireEvent.click(historyViewAll);
    expect(onOpenAspect).toHaveBeenCalledWith("history");
  });

  it("open + no ADR (adrId=null): renders no similar/history sections", () => {
    // getSimilar/getHistory throw if called, proving no fetch is attempted.
    const apiClient = makeStubClient({
      getSimilar: vi.fn(() => {
        throw new Error("getSimilar must not be called with no ADR");
      }),
      getHistory: vi.fn(() => {
        throw new Error("getHistory must not be called with no ADR");
      }),
      getAdr: vi.fn(),
    });

    render(
      <InspectorRail
        apiClient={apiClient}
        adrId={null}
        folder={null}
        open={true}
        onToggle={noop}
        onOpenAspect={noop}
      />,
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByTestId("inspector-rail")).toBeTruthy();
    expect(screen.queryByTestId("inspector-similar")).toBeNull();
    expect(screen.queryByTestId("inspector-history")).toBeNull();
  });
});
