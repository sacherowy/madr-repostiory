import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

describe("App", () => {
  it("renders the ADR Manager heading", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "ADR Manager" })).toBeInTheDocument();
    // No real server is booted in this test, so FolderTree's own mount fetch
    // hits an unreachable relative /api/tree URL in jsdom and settles into
    // its error state; waiting for that avoids an unawaited state update
    // bleeding into the next test.
    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("tracks the author name in its own controlled input", async () => {
    render(<App />);

    const authorInput = screen.getByTestId("author-name-input");
    fireEvent.change(authorInput, { target: { value: "Ada Lovelace" } });

    expect(authorInput).toHaveValue("Ada Lovelace");
    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("switching to a non-editor tab with no ADR selected renders the empty placeholder", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("panel-tab-similarity"));

    expect(screen.getByTestId("panel-empty")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("folder-tree-error")).toBeInTheDocument());
  });

  it("switching to the comparison tab with no ADR selected renders CompareLauncher instead of the empty placeholder (deliberate exemption from the gate above)", async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("panel-tab-comparison"));

    expect(screen.getByTestId("panel-comparison")).toBeInTheDocument();
    expect(screen.getByTestId("compare-version-adr-id-input")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-empty")).not.toBeInTheDocument();
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

    it("selecting a real ADR from the FolderTree loads and displays its real title in the editor panel", async () => {
      const created = await client.createAdr({ title: "Real Loaded ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(<App apiClient={client} />);

      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${created.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${created.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());
      // The real loaded title surfaces as the title input's value (inputs
      // don't render their value into textContent, so this is checked via
      // toHaveValue rather than toHaveTextContent on the panel).
      expect(screen.getByTestId("title-input")).toHaveValue("Real Loaded ADR");
      expect(screen.getByTestId("panel-editor")).toContainElement(screen.getByTestId("adr-editor-edit"));
    });

    it("selecting the target of a real supersedes relation and switching to the relations tab shows the derived superseded-by entry", async () => {
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

      render(<App apiClient={client} />);

      // Select the OLD adr (the relation's target) via the real FolderTree.
      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${oldAdr.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${oldAdr.adr.id}`));

      fireEvent.click(screen.getByTestId("panel-tab-relations"));

      await waitFor(() =>
        expect(
          screen.getByTestId(`relation-item-inbound-superseded-by-${newAdr.adr.id}`)
        ).toBeInTheDocument()
      );
    });

    it("selecting a real ADR via the FolderTree and switching to the history tab shows its real two-entry timeline", async () => {
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

      render(<App apiClient={client} />);

      await waitFor(() =>
        expect(screen.getByTestId(`adr-select-${created.adr.id}`)).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId(`adr-select-${created.adr.id}`));

      fireEvent.click(screen.getByTestId("panel-tab-history"));

      await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

      const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
      expect(entries).toHaveLength(2);
      expect(entries[0].textContent).toContain(`save ${created.adr.id}`);
      expect(entries[1].textContent).toContain(`create ${created.adr.id}`);
    });

    it("selecting a folder from the FolderTree does not change the active panel or selected ADR", async () => {
      const folder = await client.createFolder({ path: "decisions/docs-adr", author: AUTHOR });
      if (!folder.ok) throw new Error("fixture setup: createFolder unexpectedly failed");

      render(<App apiClient={client} />);

      await waitFor(() =>
        expect(screen.getByTestId("folder-select-decisions/docs-adr")).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId("folder-select-decisions/docs-adr"));

      // No ADR was ever selected, so the editor must still be in create mode
      // (adr-editor-create), and the active tab must still be "editor".
      expect(screen.getByTestId("adr-editor-create")).toBeInTheDocument();
      expect(screen.getByTestId("panel-tab-editor")).toHaveAttribute("aria-current", "true");
    });

    // The four tests below replace the pre-task-5.6 versions that used the
    // now-removed search placeholder (a free-text "type any id, click
    // select" backdoor with zero backend involvement) purely to drive App's
    // own tab-switching/author-persistence state machine. Now that SearchPanel
    // is wired in for real, the same App-level behaviors are exercised via a
    // genuine search: type a real, uniquely-matchable keyword into the real
    // search box, submit, wait for the real ranked result, and click it —
    // exactly like SearchPanel.test.tsx's own fixtures, which require going
    // through createAdr + updateAdr (the search index is only populated on
    // save()) before a term becomes findable.

    it("selecting an ADR from a real search result switches the editor panel into edit mode (was: 'selecting an ADR from the search placeholder...')", async () => {
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

      render(<App apiClient={client} />);

      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordone" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${created.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${created.adr.id}`));

      expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Zzsearchkeywordone topic");
    });

    it("switching to a non-editor tab with a real-search-selected ADR renders that panel with the ADR id (was: 'switching to a non-editor tab with an ADR selected...')", async () => {
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

      render(<App apiClient={client} />);

      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordtwo" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${created.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${created.adr.id}`));

      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      fireEvent.click(screen.getByTestId("panel-tab-similarity"));

      // Only one ADR exists, in "decisions", and no folder was ever selected
      // via FolderTree (selectedFolder stays null), so SimilarityPanel falls
      // back to that ADR's own containing folder — where it's alone. This
      // proves the panel mounted, resolved the correct scope via the real
      // backend, and reached the real emptyScope state (req 10.3), without
      // asserting literal ADR-id text that no longer appears anywhere in the
      // new render output.
      await waitFor(() =>
        expect(screen.getByTestId("panel-similarity")).toContainElement(screen.getByTestId("similarity-empty"))
      );
    });

    it("selecting a second real ADR via search while on a non-editor tab switches back to the editor panel (was: 'selecting a new ADR while on a non-editor tab...')", async () => {
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
      // Both ADRs now coexist in "decisions" by the time the similarity tab
      // is clicked below, so findSimilar's emptyScope short-circuit no
      // longer applies and it needs a real vector for both — see the
      // `seedVector` doc comment above for why this is required here.
      seedVector(savedSecond.adr.blobSha, [0.9, 0.1, 0]);

      render(<App apiClient={client} />);

      // Select the first ADR via real search, switch to a non-editor tab.
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordthree" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${first.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${first.adr.id}`));
      fireEvent.click(screen.getByTestId("panel-tab-similarity"));
      // This line's job is only a tab-switch checkpoint (confirming the
      // similarity tab is active for the first-selected ADR), not a content
      // assertion — the ranked/empty content itself is covered by
      // SimilarityPanel.test.tsx.
      expect(screen.getByTestId("panel-similarity")).toBeInTheDocument();
      // `second` already exists by this point (created in fixture setup
      // above), so `first` has a real sibling in "decisions" and the real
      // SimilarityPanel resolves to a ranked list. Waiting for it to settle
      // before navigating away mirrors every other tab-switch in this file
      // that exercises a real panel (relations/history both `waitFor`
      // before moving on) — switching away while a request is still in
      // flight leaves it unresolved past this test's `afterEach`, which can
      // make the real server's `app.close()` hang on that still-open socket.
      await waitFor(() => expect(screen.getByTestId("similarity-results")).toBeInTheDocument());

      // Select a second, distinct real ADR via a second real search while
      // still on the similarity tab.
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordfour" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${second.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${second.adr.id}`));

      expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
      expect(screen.queryByTestId("panel-similarity")).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Zzsearchkeywordfour topic");
    });

    it("keeps the author name in the input across tab and real-search ADR changes, and stays in edit mode for the selected ADR (was: 'keeps the author name in the input...')", async () => {
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

      render(<App apiClient={client} />);

      fireEvent.change(screen.getByTestId("author-name-input"), { target: { value: "Grace Hopper" } });

      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordfive" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${first.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${first.adr.id}`));

      fireEvent.click(screen.getByTestId("panel-tab-similarity"));
      // Unlike the old static placeholder this tab used to render, the real
      // SimilarityPanel issues a real in-flight request on mount (it falls
      // back to the ADR's own folder here, since none was ever selected via
      // FolderTree). Waiting for it to settle before switching away mirrors
      // every other tab-switch in this file that exercises a real panel
      // (relations/history both `waitFor` before moving on) — switching away
      // while a request is still in flight leaves it unresolved past this
      // test's `afterEach`, which can make the real server's `app.close()`
      // hang on that still-open socket.
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

    it("creates an ADR, edits and saves it, recovers from a real 409 conflict via reload, and successfully saves again", async () => {
      render(<App apiClient={client} />);

      // The session author name is a separate controlled input on the shell
      // (not part of AdrEditor itself) and defaults to "", which fails
      // create's own missing-fields validation — every save in this flow
      // needs it set first, exactly like every other author-name test in
      // this file.
      fireEvent.change(screen.getByTestId("author-name-input"), { target: { value: AUTHOR } });

      // 1. Create a brand-new ADR through the default create-mode editor.
      expect(screen.getByTestId("adr-editor-create")).toBeInTheDocument();
      fireEvent.change(screen.getByTestId("title-input"), {
        target: { value: "End To End Flow ADR" },
      });
      fireEvent.click(screen.getByTestId("create-button"));

      // App's real onAdrSaved wiring (setSelectedAdrId) flips the shell into
      // edit mode for the newly created ADR's id.
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("End To End Flow ADR");

      // 2. Edit the body and save — the ordinary, non-conflicting save path
      // ("editing it, saving it").
      fireEvent.change(screen.getByTestId("body-textarea"), {
        target: { value: "First real edit from the UI." },
      });
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("save-success-message")).toBeInTheDocument());

      // The created ADR's id is only known to the running app (it isn't
      // rendered as text anywhere in the form). The search index is only
      // populated on save() (not on create(), which writes an empty body —
      // see AdrEditingService.create's doc comment), so only after the save
      // above is the id recoverable from the real backend via a plain
      // search on its unique title.
      const found = await client.search("End To End Flow ADR");
      if (!found.ok) throw new Error("fixture setup: search for the created ADR unexpectedly failed");
      expect(found.hits).toHaveLength(1);
      const adrId = found.hits[0].id;

      // Capture the blobSha left behind by that save directly from the real
      // server, since that's the exact baseBlobSha the editor now holds in
      // its own state.
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

      // 4. Edit the body again in the UI and save again — this save is now
      // stale (its baseBlobSha no longer matches HEAD), so it must surface
      // the real conflict, not a success.
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
      // the reload — this is the task's explicit postcondition: the editor
      // must reach a successful saved state after reloading from a conflict.
      fireEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => expect(screen.getByTestId("save-success-message")).toBeInTheDocument());
      expect(screen.queryByTestId("conflict-message")).not.toBeInTheDocument();
    });
  });
});
