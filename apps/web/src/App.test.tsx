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
  it("renders the ADR Manager heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "ADR Manager" })).toBeInTheDocument();
  });

  it("tracks the author name in its own controlled input", () => {
    render(<App />);

    const authorInput = screen.getByTestId("author-name-input");
    fireEvent.change(authorInput, { target: { value: "Ada Lovelace" } });

    expect(authorInput).toHaveValue("Ada Lovelace");
  });

  it("selecting an ADR from the tree placeholder switches the editor panel into edit mode", async () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-001" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));

    // No real server is booted in this test: AdrEditor's load effect for a
    // fake id hits an unreachable relative /api/... URL in jsdom, catches the
    // network failure, and renders adr-editor-not-found. Seeing that testid
    // is a genuine structural proof App switched into edit mode for this id
    // (create mode would render adr-editor-create instead, never this).
    expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("adr-editor-not-found")).toBeInTheDocument());
  });

  it("selecting an ADR from the search placeholder switches the editor panel into edit mode", async () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("search-adr-id-input"), { target: { value: "adr-002" } });
    fireEvent.click(screen.getByTestId("select-adr-from-search-button"));

    expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("adr-editor-not-found")).toBeInTheDocument());
  });

  it("switching to a non-editor tab with an ADR selected renders that panel with the ADR id", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-003" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));
    fireEvent.click(screen.getByTestId("panel-tab-relations"));

    expect(screen.getByTestId("panel-relations")).toHaveTextContent("adr-003");
  });

  it("switching to a non-editor tab with no ADR selected renders the empty placeholder", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("panel-tab-history"));

    expect(screen.getByTestId("panel-empty")).toBeInTheDocument();
  });

  it("selecting a new ADR while on a non-editor tab switches back to the editor panel", async () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-004" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));
    fireEvent.click(screen.getByTestId("panel-tab-relations"));
    expect(screen.getByTestId("panel-relations")).toHaveTextContent("adr-004");

    fireEvent.change(screen.getByTestId("search-adr-id-input"), { target: { value: "adr-005" } });
    fireEvent.click(screen.getByTestId("select-adr-from-search-button"));

    expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-relations")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("adr-editor-not-found")).toBeInTheDocument());
  });

  it("keeps the author name in the input across tab and ADR changes, and stays in edit mode for the selected ADR", async () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("author-name-input"), { target: { value: "Grace Hopper" } });
    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-006" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));
    fireEvent.click(screen.getByTestId("panel-tab-history"));
    fireEvent.click(screen.getByTestId("panel-tab-editor"));

    expect(screen.getByTestId("author-name-input")).toHaveValue("Grace Hopper");
    expect(screen.getByTestId("panel-editor")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("adr-editor-not-found")).toBeInTheDocument());
  });

  it("selecting a folder does not change the active panel or selected ADR", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("folder-path-input"), { target: { value: "docs/adr" } });
    fireEvent.click(screen.getByTestId("select-folder-button"));

    // No ADR was ever selected, so the editor must still be in create mode
    // (adr-editor-create), and the active tab must still be "editor".
    expect(screen.getByTestId("adr-editor-create")).toBeInTheDocument();
    expect(screen.getByTestId("panel-tab-editor")).toHaveAttribute("aria-current", "true");
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

    it("selecting a real ADR id from the tree placeholder loads and displays its real title in the editor panel", async () => {
      const created = await client.createAdr({ title: "Real Loaded ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(<App apiClient={client} />);

      fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: created.adr.id } });
      fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));

      await waitFor(() => expect(screen.getByTestId("title-input")).toBeInTheDocument());
      // The real loaded title surfaces as the title input's value (inputs
      // don't render their value into textContent, so this is checked via
      // toHaveValue rather than toHaveTextContent on the panel).
      expect(screen.getByTestId("title-input")).toHaveValue("Real Loaded ADR");
      expect(screen.getByTestId("panel-editor")).toContainElement(screen.getByTestId("adr-editor-edit"));
    });
  });
});
