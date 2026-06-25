import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/api/client.test.ts (task 4.1):
// @adr/api has no exports field, so it's reached via a relative path into its
// src/ rather than a bare specifier. App.test.tsx lives one directory
// shallower than AdrEditor.test.tsx, so the path has one fewer `../`.
import { buildContainer, type Container } from "../../api/src/container.js";
import { buildServer } from "../../api/src/server.js";
import { createApiClient, type ApiClient } from "./api/client.js";
import { createQueryClient } from "./state/queryClient.js";
import { useWorkspaceStore } from "./state/workspaceStore.js";
import { App } from "./App.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "app-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

// Each rendered App now gets its own fresh query client; we track the live one
// so `afterEach` can cancel its in-flight queries before tearing the server
// down. The contextual shell fires several background queries on selection
// (`useAspectCounts`, the context-header summary, inspector previews); if any
// is still in flight when the real Fastify server's `app.close()` runs, its
// still-open socket makes `close()` hang past the hook timeout. Cancelling the
// queries first lets those sockets drain so the server closes promptly.
let activeQueryClient: QueryClient | null = null;

/**
 * Renders App through a fresh QueryClientProvider. The contextual shell now
 * consumes TanStack Query (useAspectCounts, the inspector previews, and the
 * context-header summary), so every render needs a provider — each call builds
 * its own client so server-state caches never bleed across tests.
 */
function renderApp(ui: ReactElement) {
  const client = createQueryClient();
  activeQueryClient = client;
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  // Reset the cross-zone store so view-state never bleeds between tests (Req 10.4).
  useWorkspaceStore.getState().reset();
  activeQueryClient = null;
});

describe("App", () => {
  it("renders the ADR Manager heading", async () => {
    renderApp(<App />);

    expect(screen.getByRole("heading", { name: "ADR Manager" })).toBeInTheDocument();
    // No real server is booted in this test, so FolderTree's own mount fetch
    // hits an unreachable relative /api/tree URL in jsdom and settles into
    // its error state; waiting for that avoids an unawaited state update
    // bleeding into the next test.
    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("tracks the author name via the command-bar author input", async () => {
    renderApp(<App />);

    const authorInput = screen.getByTestId("author-name-input");
    fireEvent.change(authorInput, { target: { value: "Ada Lovelace" } });

    expect(authorInput).toHaveValue("Ada Lovelace");
    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("shows the browse/create state and NO aspect switcher when nothing is selected", async () => {
    renderApp(<App />);

    // The welcoming browse/create state replaces the old empty placeholder
    // (Req 1.3, Hook Migration Map: panel-empty removed) and still hosts the
    // create flow (Req 1.3).
    expect(screen.getByTestId("center-browse")).toBeInTheDocument();
    expect(screen.getByTestId("adr-editor-create")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-empty")).not.toBeInTheDocument();

    // The contextual aspect switcher must NOT appear before an ADR is selected
    // (Req 2.2, 11.1): none of the migrated panel-tab-* controls are present.
    expect(screen.queryByTestId("panel-tab-editor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-tab-relations")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-tab-history")).not.toBeInTheDocument();
    expect(screen.queryByTestId("panel-tab-similarity")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("does NOT render the standalone SearchPanel in the shell (it lives only in the palette)", async () => {
    renderApp(<App />);

    // With the palette closed, the search box is absent from the shell entirely
    // (Req 4: SearchPanel folded into the command palette).
    expect(screen.queryByTestId("search-query-input")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("opens the command palette via Cmd/Ctrl-K", async () => {
    renderApp(<App />);

    expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(screen.getByTestId("command-palette")).toBeInTheDocument();
    // SearchPanel is mounted inside the open palette.
    expect(screen.getByTestId("search-query-input")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("opens comparison as an action via the command-bar Compare control, with NO ADR selected", async () => {
    renderApp(<App />);

    // The migrated panel-tab-comparison hook now lives on the command-bar
    // Compare action and is reachable without any selection (Req 2.5, 11.2).
    expect(screen.queryByTestId("panel-comparison")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("panel-tab-comparison"));

    expect(screen.getByTestId("panel-comparison")).toBeInTheDocument();
    // CompareLauncher owns its own id-entry field inside the overlay.
    expect(screen.getByTestId("compare-version-adr-id-input")).toBeInTheDocument();
    // Still no aspect switcher — comparison is an action, not an aspect.
    expect(screen.queryByTestId("panel-tab-editor")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("dismisses the comparison overlay via its Close control", async () => {
    renderApp(<App />);

    fireEvent.click(screen.getByTestId("panel-tab-comparison"));
    expect(screen.getByTestId("panel-comparison")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("comparison-close"));
    expect(screen.queryByTestId("panel-comparison")).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  describe("with a real backing server", () => {
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
      // Cancel any background queries (counts/summary/previews) still in flight
      // so their sockets drain and `app.close()` below does not hang on a
      // still-open connection, then proactively drop any sockets that remain.
      if (activeQueryClient !== null) {
        await activeQueryClient.cancelQueries();
        activeQueryClient.clear();
      }
      app.server.closeAllConnections();
      await app.close();
      await rm(repoPath, { recursive: true, force: true });
    });

    /**
     * `container`'s `GeminiEmbeddingProvider` is wired with fake creds: any
     * genuine cache miss makes `SimilarityService.vectorFor` attempt a real
     * network call, which fails with a real 400 from Google's API and
     * surfaces as a 404 from `GET /api/adrs/:id/similar` (the route's catch
     * maps every `findSimilar` throw to 404). That 404 is invisible in the
     * single-ADR-scope tests elsewhere in this file because `findSimilar`
     * returns `emptyScope` before ever computing a vector when there's only
     * one ADR in scope — but the moment a second real ADR coexists in the
     * same scope (as in the test below), `findSimilar` needs real vectors
     * for both and hits the network. Pre-seeding each fixture's blob sha
     * here (the exact cache-hit path `vectorFor` checks first) avoids that
     * network call entirely, mirroring `SimilarityPanel.test.tsx`'s and
     * `apps/api/src/routes/similarity.test.ts`'s own `seedVector` helper.
     */
    function seedVector(blobSha: string, vector: number[]): void {
      container.embeddingStore.set(blobSha, vector);
    }

    it("selecting a real ADR from the explorer shows the ContextHeader + AspectSwitcher + the editor aspect", async () => {
      const created = await client.createAdr({ title: "Real Loaded ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      // Before selecting, the contextual surfaces are absent.
      expect(screen.getByTestId("center-browse")).toBeInTheDocument();
      expect(screen.queryByTestId("context-header")).not.toBeInTheDocument();
      expect(screen.queryByTestId("panel-tab-editor")).not.toBeInTheDocument();

      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${created.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${created.adr.id}`));

      // Selecting an ADR reshapes the center around it (Req 1.2, 2.2): the
      // browse state is gone, the context header + four migrated aspect
      // controls appear, and the editor aspect is active by default.
      await waitFor(() => expect(screen.getByTestId("context-header")).toBeInTheDocument());
      expect(screen.queryByTestId("center-browse")).not.toBeInTheDocument();
      expect(screen.getByTestId("panel-tab-editor")).toBeInTheDocument();
      expect(screen.getByTestId("panel-tab-relations")).toBeInTheDocument();
      expect(screen.getByTestId("panel-tab-history")).toBeInTheDocument();
      expect(screen.getByTestId("panel-tab-similarity")).toBeInTheDocument();

      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());
      // The real loaded title surfaces as the title input's value (inputs
      // don't render their value into textContent, so this is checked via
      // toHaveValue rather than toHaveTextContent on the panel).
      expect(screen.getByTestId("title-input")).toHaveValue("Real Loaded ADR");
      expect(screen.getByTestId("panel-editor")).toContainElement(screen.getByTestId("adr-editor-edit"));
    });

    it("the context header's inline Compare action opens the comparison overlay for a selected ADR", async () => {
      const created = await client.createAdr({ title: "Comparable ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${created.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${created.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("context-compare")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("context-compare"));

      expect(screen.getByTestId("panel-comparison")).toBeInTheDocument();
      expect(screen.getByTestId("compare-version-adr-id-input")).toBeInTheDocument();
    });

    it("selecting an ADR and activating the relations aspect shows the derived superseded-by entry", async () => {
      const oldAdr = await client.createAdr({ title: "Old decision", folder: "decisions", author: AUTHOR });
      if (!oldAdr.ok) throw new Error("fixture setup: createAdr oldAdr unexpectedly failed");
      const newAdr = await client.createAdr({ title: "New decision", folder: "decisions", author: AUTHOR });
      if (!newAdr.ok) throw new Error("fixture setup: createAdr newAdr unexpectedly failed");

      const saved = await client.updateAdr(newAdr.adr.id, {
        title: newAdr.adr.title,
        status: newAdr.adr.status,
        date: newAdr.adr.date,
        deciders: newAdr.adr.deciders,
        tags: newAdr.adr.tags,
        body: "Replaces the old decision.",
        relations: [{ type: "supersedes", target: oldAdr.adr.id }],
        author: AUTHOR,
        baseBlobSha: newAdr.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr newAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      // Select the OLD adr (the relation's target) via the real explorer/tree.
      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${oldAdr.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${oldAdr.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("panel-tab-relations")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("panel-tab-relations"));

      await waitFor(() =>
        expect(
          screen.getByTestId(`relation-item-inbound-superseded-by-${newAdr.adr.id}`)
        ).toBeInTheDocument()
      );
    });

    it("selecting an ADR and activating the history aspect shows its real two-entry timeline", async () => {
      const created = await client.createAdr({ title: "Tracked decision", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      const saved = await client.updateAdr(created.adr.id, {
        title: "Tracked decision (updated)",
        status: created.adr.status,
        date: created.adr.date,
        deciders: created.adr.deciders,
        tags: created.adr.tags,
        body: "Updated body.",
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${created.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${created.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("panel-tab-history")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("panel-tab-history"));

      await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

      const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
      expect(entries).toHaveLength(2);
      expect(entries[0].textContent).toContain(`save ${created.adr.id}`);
      expect(entries[1].textContent).toContain(`create ${created.adr.id}`);
    });

    it("selecting a folder from the explorer does not select an ADR or leave the browse/create state", async () => {
      const folder = await client.createFolder({ path: "decisions/docs-adr", author: AUTHOR });
      if (!folder.ok) throw new Error("fixture setup: createFolder unexpectedly failed");

      renderApp(<App apiClient={client} />);

      await waitFor(() =>
        expect(screen.getByTestId("folder-select-decisions/docs-adr")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId("folder-select-decisions/docs-adr"));

      // No ADR was ever selected, so the center stays in the browse/create
      // state (create-mode editor reachable) and no context header appears.
      expect(screen.getByTestId("center-browse")).toBeInTheDocument();
      expect(screen.getByTestId("adr-editor-create")).toBeInTheDocument();
      expect(screen.queryByTestId("context-header")).not.toBeInTheDocument();
    });

    it("selecting an ADR from a command-palette search result switches to the editor aspect and closes the palette", async () => {
      const created = await client.createAdr({ title: "Zzsearchkeywordone topic", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const saved = await client.updateAdr(created.adr.id, {
        title: "Zzsearchkeywordone topic",
        status: created.adr.status,
        date: created.adr.date,
        deciders: created.adr.deciders,
        tags: created.adr.tags,
        body: "Body mentioning zzsearchkeywordone for indexing.",
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      // Search now lives only in the command palette; open it via Cmd-K.
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordone" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${created.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${created.adr.id}`));

      // Selecting a result selects the ADR and closes the palette (Req 4.3).
      expect(screen.queryByTestId("command-palette")).not.toBeInTheDocument();
      expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Zzsearchkeywordone topic");
    });

    it("activating the Similar aspect for a palette-selected ADR renders the similarity panel in its real scope", async () => {
      const created = await client.createAdr({ title: "Zzsearchkeywordtwo topic", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const saved = await client.updateAdr(created.adr.id, {
        title: "Zzsearchkeywordtwo topic",
        status: created.adr.status,
        date: created.adr.date,
        deciders: created.adr.deciders,
        tags: created.adr.tags,
        body: "Body mentioning zzsearchkeywordtwo for indexing.",
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordtwo" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${created.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${created.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("panel-tab-similarity"));

      // Only one ADR exists, in "decisions", and no folder was ever selected
      // via the tree (selectedFolder stays null), so SimilarityPanel falls
      // back to that ADR's own containing folder — where it's alone. This
      // proves the panel mounted, resolved the correct scope via the real
      // backend, and reached the real emptyScope state (req 10.3).
      await waitFor(() =>
        expect(screen.getByTestId("panel-similarity")).toContainElement(screen.getByTestId("similarity-empty"))
      );
    });

    it("selecting a second ADR via the palette while on a non-editor aspect switches back to the editor aspect", async () => {
      const first = await client.createAdr({ title: "Zzsearchkeywordthree topic", folder: "decisions", author: AUTHOR });
      if (!first.ok) throw new Error("fixture setup: createAdr first unexpectedly failed");
      const savedFirst = await client.updateAdr(first.adr.id, {
        title: "Zzsearchkeywordthree topic",
        status: first.adr.status,
        date: first.adr.date,
        deciders: first.adr.deciders,
        tags: first.adr.tags,
        body: "Body mentioning zzsearchkeywordthree for indexing.",
        author: AUTHOR,
        baseBlobSha: first.adr.blobSha,
      });
      if (!savedFirst.ok) throw new Error("fixture setup: updateAdr first unexpectedly failed");
      seedVector(savedFirst.adr.blobSha, [1, 0, 0]);

      const second = await client.createAdr({ title: "Zzsearchkeywordfour topic", folder: "decisions", author: AUTHOR });
      if (!second.ok) throw new Error("fixture setup: createAdr second unexpectedly failed");
      const savedSecond = await client.updateAdr(second.adr.id, {
        title: "Zzsearchkeywordfour topic",
        status: second.adr.status,
        date: second.adr.date,
        deciders: second.adr.deciders,
        tags: second.adr.tags,
        body: "Body mentioning zzsearchkeywordfour for indexing.",
        author: AUTHOR,
        baseBlobSha: second.adr.blobSha,
      });
      if (!savedSecond.ok) throw new Error("fixture setup: updateAdr second unexpectedly failed");
      // Both ADRs now coexist in "decisions" by the time the similarity aspect
      // is activated below, so findSimilar's emptyScope short-circuit no
      // longer applies and it needs a real vector for both — see the
      // `seedVector` doc comment above for why this is required here.
      seedVector(savedSecond.adr.blobSha, [0.9, 0.1, 0]);

      renderApp(<App apiClient={client} />);

      // Select the first ADR via a real palette search, switch to a non-editor aspect.
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordthree" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${first.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${first.adr.id}`));
      await waitFor(() => expect(screen.getByTestId("panel-tab-similarity")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("panel-tab-similarity"));
      expect(screen.getByTestId("panel-similarity")).toBeInTheDocument();
      // `second` already exists by this point, so `first` has a real sibling in
      // "decisions" and the real SimilarityPanel resolves to a ranked list.
      // Waiting for it to settle before navigating away mirrors every other
      // aspect-switch in this file that exercises a real panel — switching away
      // while a request is still in flight leaves it unresolved past this
      // test's afterEach, which can make the real server's app.close() hang on
      // that still-open socket.
      await waitFor(() => expect(screen.getByTestId("similarity-results")).toBeInTheDocument());

      // Select a second, distinct real ADR via a second palette search while
      // still on the similarity aspect.
      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordfour" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${second.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${second.adr.id}`));

      // Selecting a new ADR forces the editor aspect (store invariant, Req 1.2).
      expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
      expect(screen.queryByTestId("panel-similarity")).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Zzsearchkeywordfour topic");
    });

    it("keeps the author name across aspect and palette-selected ADR changes, staying in edit mode for the selection", async () => {
      const first = await client.createAdr({ title: "Zzsearchkeywordfive topic", folder: "decisions", author: AUTHOR });
      if (!first.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
      const savedFirst = await client.updateAdr(first.adr.id, {
        title: "Zzsearchkeywordfive topic",
        status: first.adr.status,
        date: first.adr.date,
        deciders: first.adr.deciders,
        tags: first.adr.tags,
        body: "Body mentioning zzsearchkeywordfive for indexing.",
        author: AUTHOR,
        baseBlobSha: first.adr.blobSha,
      });
      if (!savedFirst.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

      renderApp(<App apiClient={client} />);

      fireEvent.change(screen.getByTestId("author-name-input"), { target: { value: "Grace Hopper" } });

      fireEvent.keyDown(window, { key: "k", metaKey: true });
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordfive" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${first.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${first.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("panel-tab-similarity")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("panel-tab-similarity"));
      // Unlike the old static placeholder, the real SimilarityPanel issues a
      // real in-flight request on mount (it falls back to the ADR's own folder
      // here, since none was ever selected via the tree). Waiting for it to
      // settle before switching away mirrors every other aspect-switch in this
      // file that exercises a real panel — switching away while a request is
      // still in flight leaves it unresolved past this test's afterEach, which
      // can make the real server's app.close() hang on that still-open socket.
      await waitFor(() =>
        expect(
          screen.queryByTestId("similarity-empty") ?? screen.queryByTestId("similarity-results")
        ).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId("panel-tab-editor"));

      expect(screen.getByTestId("author-name-input")).toHaveValue("Grace Hopper");
      expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Zzsearchkeywordfive topic");
    });

    it("creates an ADR from the browse state, edits and saves it, recovers from a real 409 conflict via reload, and saves again", async () => {
      renderApp(<App apiClient={client} />);

      // The session author name is a separate controlled input on the command
      // bar (not part of AdrEditor itself) and defaults to "", which fails
      // create's own missing-fields validation — every save in this flow needs
      // it set first.
      fireEvent.change(screen.getByTestId("author-name-input"), { target: { value: AUTHOR } });

      // 1. Create a brand-new ADR through the browse/create-state editor.
      expect(screen.getByTestId("center-browse")).toBeInTheDocument();
      expect(screen.getByTestId("adr-editor-create")).toBeInTheDocument();
      fireEvent.change(screen.getByTestId("title-input"), {
        target: { value: "End To End Flow ADR" },
      });
      fireEvent.click(screen.getByTestId("create-button"));

      // App's onAdrSaved wiring (store.selectAdr) flips the shell into the
      // editor aspect for the newly created ADR's id, reshaping the center.
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("context-header")).toBeInTheDocument();
      expect(screen.queryByTestId("center-browse")).not.toBeInTheDocument();
      expect(screen.getByTestId("title-input")).toHaveValue("End To End Flow ADR");

      // 2. Edit the body and save — the ordinary, non-conflicting save path.
      fireEvent.change(screen.getByTestId("body-textarea"), {
        target: { value: "First real edit from the UI." },
      });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("save-success-message")).toBeInTheDocument());

      // The created ADR's id is only known to the running app (it isn't
      // rendered as text anywhere in the form). The search index is only
      // populated on save() (not on create(), which writes an empty body —
      // see AdrEditingService.create's doc comment), so only after the save
      // above is the id recoverable from the real backend via a plain search.
      const found = await client.search("End To End Flow ADR");
      if (!found.ok) throw new Error("fixture setup: search for the created ADR unexpectedly failed");
      expect(found.hits).toHaveLength(1);
      const adrId = found.hits[0].id;

      const afterFirstSave = await client.getAdr(adrId);
      if (!afterFirstSave.ok) throw new Error("fixture setup: getAdr after first save unexpectedly failed");
      const blobShaAfterFirstSave = afterFirstSave.adr.blobSha;

      // 3. Force a conflict: behind the editor's back, a concurrent writer
      // saves using that SAME baseBlobSha, making the editor's own next save
      // (still holding that same sha) stale.
      const concurrentWriterSave = await client.updateAdr(adrId, {
        title: afterFirstSave.adr.title,
        status: afterFirstSave.adr.status,
        date: afterFirstSave.adr.date,
        deciders: afterFirstSave.adr.deciders,
        tags: afterFirstSave.adr.tags,
        relations: afterFirstSave.adr.relations,
        body: "Concurrent writer's content.",
        author: "Other Author <other@example.com>",
        baseBlobSha: blobShaAfterFirstSave,
      });
      if (!concurrentWriterSave.ok) {
        throw new Error("fixture setup: concurrent updateAdr unexpectedly failed");
      }

      // 4. Edit the body again in the UI and save again — now stale, so it must
      // surface the real conflict, not a success.
      fireEvent.change(screen.getByTestId("body-textarea"), {
        target: { value: "Second local edit, now stale." },
      });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("conflict-message")).toBeInTheDocument());
      expect(screen.queryByTestId("save-success-message")).not.toBeInTheDocument();

      // 5. Reload the latest version on demand — the form must now show the
      // concurrent writer's real content.
      fireEvent.click(screen.getByTestId("reload-latest-button"));

      await waitFor(() =>
        expect(screen.getByTestId("body-textarea")).toHaveValue("Concurrent writer's content.")
      );

      // 6. Save once more now that the form holds the fresh baseBlobSha from
      // the reload — the editor must reach a successful saved state again.
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("save-success-message")).toBeInTheDocument());
      expect(screen.queryByTestId("conflict-message")).not.toBeInTheDocument();
    });
  });
});
