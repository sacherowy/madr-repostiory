import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/features/history-timeline/HistoryTimeline.test.tsx
// (task 5.4): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. SearchPanel.test.tsx is a
// sibling of HistoryTimeline.test.tsx, RelationsPanel.test.tsx,
// FolderTree.test.tsx, and AdrEditor.test.tsx, so the `../` depth matches
// exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { SearchPanel } from "./SearchPanel.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "search-panel-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("SearchPanel", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await initRepo();
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);

    app = await buildServer(container);
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    cleanup();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  // The search index is only populated on save() (PUT), not create() (POST)
  // — see editingService.ts's own doc-comment ("an empty-body ADR has
  // nothing meaningful to index yet"). Every fixture that needs to be
  // findable must go through both calls, exactly like search.test.ts's own
  // createAdr+saveAdr fixture helpers.
  async function createSearchableAdr(
    title: string,
    overrides: Partial<{ body: string; tags: string[] }> = {}
  ) {
    const created = await client.createAdr({ title, folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const saved = await client.updateAdr(created.adr.id, {
      title,
      status: created.adr.status,
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      tags: overrides.tags,
      body: overrides.body ?? "Body text.",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
    return saved.adr;
  }

  it("idle: shows neither results nor a no-results message before any search is submitted", () => {
    render(<SearchPanel apiClient={client} onSelectAdr={vi.fn()} />);

    expect(screen.queryByTestId("search-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-no-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-error")).not.toBeInTheDocument();
  });

  it("searching a real distinctive keyword renders a ranked results list containing that ADR's real id (req 9.1, 9.2)", async () => {
    const adr = await createSearchableAdr("Bespoke widget rendering", {
      body: "Discusses how zzkeywordalpha widgets are rendered.",
    });

    render(<SearchPanel apiClient={client} onSelectAdr={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "zzkeywordalpha" },
    });
    fireEvent.click(screen.getByTestId("search-submit-button"));

    await waitFor(() => expect(screen.getByTestId("search-results")).toBeInTheDocument());
    expect(screen.getByTestId(`search-result-${adr.id}`)).toBeInTheDocument();
  });

  it("searching a term that matches nothing shows the no-results message, distinguishable from idle and with-results (req 9.3)", async () => {
    await createSearchableAdr("Completely unrelated topic", {
      body: "Nothing to do with the search term at all.",
    });

    render(<SearchPanel apiClient={client} onSelectAdr={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "zzznonexistentzzz" },
    });
    fireEvent.click(screen.getByTestId("search-submit-button"));

    await waitFor(() => expect(screen.getByTestId("search-no-results")).toBeInTheDocument());
    expect(screen.queryByTestId("search-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-error")).not.toBeInTheDocument();
  });

  it("clicking a real result calls onSelectAdr with that hit's real id (req 9.4)", async () => {
    const adr = await createSearchableAdr("Selectable search result", {
      body: "Contains zzkeywordbeta somewhere in the body.",
    });

    const onSelectAdr = vi.fn();
    render(<SearchPanel apiClient={client} onSelectAdr={onSelectAdr} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "zzkeywordbeta" },
    });
    fireEvent.click(screen.getByTestId("search-submit-button"));

    await waitFor(() => expect(screen.getByTestId(`search-result-${adr.id}`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`search-result-${adr.id}`));

    expect(onSelectAdr).toHaveBeenCalledWith(adr.id);
  });

  it("renders results in the same ranked order the backend returns from a direct client.search call (req 9.2)", async () => {
    const bodyMatch = await createSearchableAdr("First ADR", {
      body: "This decision concerns the zzquasarterm subsystem in passing.",
    });
    const titleMatch = await createSearchableAdr("Zzquasarterm subsystem redesign", {
      body: "Unrelated body content here.",
    });

    render(<SearchPanel apiClient={client} onSelectAdr={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "zzquasarterm" },
    });
    fireEvent.click(screen.getByTestId("search-submit-button"));

    await waitFor(() => expect(screen.getByTestId("search-results")).toBeInTheDocument());

    // Cross-check the rendered order against a direct API call, mirroring
    // HistoryTimeline.test.tsx's own ordering-verification style: never
    // hardcode an assumed order, always confirm it against the real backend
    // response in the same test.
    const direct = await client.search("zzquasarterm");
    if (!direct.ok) throw new Error("fixture setup: direct client.search unexpectedly failed");
    expect(direct.hits.length).toBe(2);
    expect(direct.hits[0].id).toBe(titleMatch.id);
    expect(direct.hits[1].id).toBe(bodyMatch.id);

    const renderedIds = screen.getAllByTestId(/^search-result-/).map((el) => el.getAttribute("data-testid"));
    expect(renderedIds).toEqual(direct.hits.map((hit) => `search-result-${hit.id}`));
  });

  it("shows a loading state while the search request is in flight", async () => {
    await createSearchableAdr("Loading state ADR", { body: "Contains zzkeywordgamma in the body." });

    render(<SearchPanel apiClient={client} onSelectAdr={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "zzkeywordgamma" },
    });
    fireEvent.click(screen.getByTestId("search-submit-button"));

    // The real request is fast but asynchronous; the loading state should be
    // observable immediately after submit, before the results resolve.
    expect(screen.getByTestId("search-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("search-results")).toBeInTheDocument());
    expect(screen.queryByTestId("search-loading")).not.toBeInTheDocument();
  });

  it("shows an error state when the search request throws (network-level failure)", async () => {
    const throwingClient: ApiClient = {
      ...client,
      search: vi.fn().mockRejectedValue(new Error("network down")),
    };

    render(<SearchPanel apiClient={throwingClient} onSelectAdr={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "anything" },
    });
    fireEvent.click(screen.getByTestId("search-submit-button"));

    await waitFor(() => expect(screen.getByTestId("search-error")).toBeInTheDocument());
    expect(screen.queryByTestId("search-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-no-results")).not.toBeInTheDocument();
  });

  it("submitting the form via Enter (not just the button click) also triggers a search", async () => {
    const adr = await createSearchableAdr("Enter key search ADR", {
      body: "Contains zzkeyworddelta in the body.",
    });

    render(<SearchPanel apiClient={client} onSelectAdr={vi.fn()} />);

    fireEvent.change(screen.getByTestId("search-query-input"), {
      target: { value: "zzkeyworddelta" },
    });
    fireEvent.submit(screen.getByTestId("search-form"));

    await waitFor(() => expect(screen.getByTestId(`search-result-${adr.id}`)).toBeInTheDocument());
  });
});
