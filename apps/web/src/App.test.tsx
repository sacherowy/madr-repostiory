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

      await waitFor(() => expect(screen.getByTestId("panel-similarity")).toHaveTextContent(created.adr.id));
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

      render(<App apiClient={client} />);

      // Select the first ADR via real search, switch to a non-editor tab.
      fireEvent.change(screen.getByTestId("search-query-input"), { target: { value: "zzsearchkeywordthree" } });
      fireEvent.click(screen.getByTestId("search-submit-button"));
      await waitFor(() => expect(screen.getByTestId(`search-result-${first.adr.id}`)).toBeInTheDocument());
      fireEvent.click(screen.getByTestId(`search-result-${first.adr.id}`));
      fireEvent.click(screen.getByTestId("panel-tab-similarity"));
      expect(screen.getByTestId("panel-similarity")).toHaveTextContent(first.adr.id);

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
      fireEvent.click(screen.getByTestId("panel-tab-editor"));

      expect(screen.getByTestId("author-name-input")).toHaveValue("Grace Hopper");
      expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId("adr-editor-edit")).toBeInTheDocument());
      expect(screen.getByTestId("title-input")).toHaveValue("Zzsearchkeywordfive topic");
    });
  });
});
