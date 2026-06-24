import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/features/adr-editor/AdrEditor.test.tsx
// (task 4.1/5.1): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. FolderTree.test.tsx is a
// sibling of AdrEditor.test.tsx, so the `../` depth matches exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { FolderTree } from "./FolderTree.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "folder-tree-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("FolderTree", () => {
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

  it("shows folder-tree-loading then renders the full tree from root", async () => {
    const created = await client.createAdr({ title: "Root ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
    );

    expect(screen.getByTestId("folder-tree-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());
    const adrNode = screen.getByTestId(`adr-node-${created.adr.id}`);
    expect(adrNode.textContent).toContain("Root ADR");
    expect(adrNode.textContent).toContain(created.adr.id);
    expect(adrNode.textContent).toContain("proposed");

    expect(screen.getByTestId("folder-node-decisions")).toBeInTheDocument();
  });

  it("expand/collapse toggles hide and reshow a folder's children without losing data", async () => {
    const created = await client.createAdr({ title: "Toggle ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("folder-toggle-decisions"));
    expect(screen.queryByTestId(`adr-node-${created.adr.id}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("folder-toggle-decisions"));
    expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`adr-node-${created.adr.id}`).textContent).toContain("Toggle ADR");
  });

  it("selecting a folder scopes the displayed tree to just that folder's subtree", async () => {
    const folderA = await client.createFolder({ path: "decisions/alpha", author: AUTHOR });
    if (!folderA.ok) throw new Error("fixture setup: createFolder alpha unexpectedly failed");
    const folderB = await client.createFolder({ path: "decisions/beta", author: AUTHOR });
    if (!folderB.ok) throw new Error("fixture setup: createFolder beta unexpectedly failed");

    const adrAlpha = await client.createAdr({ title: "Alpha ADR", folder: "decisions/alpha", author: AUTHOR });
    if (!adrAlpha.ok) throw new Error("fixture setup: createAdr alpha unexpectedly failed");
    const adrBeta = await client.createAdr({ title: "Beta ADR", folder: "decisions/beta", author: AUTHOR });
    if (!adrBeta.ok) throw new Error("fixture setup: createAdr beta unexpectedly failed");

    const onSelectFolder = vi.fn();
    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={onSelectFolder} onSelectAdr={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByTestId(`adr-node-${adrAlpha.adr.id}`)).toBeInTheDocument());
    expect(screen.getByTestId(`adr-node-${adrBeta.adr.id}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("folder-select-decisions/alpha"));

    expect(onSelectFolder).toHaveBeenCalledWith("decisions/alpha");

    // The scoped fetch passes through a loading state first (during which
    // neither ADR is in the DOM), so wait for the scoped tree to finish
    // loading and re-render before asserting on which ADRs are present.
    await waitFor(() => expect(screen.getByTestId(`adr-node-${adrAlpha.adr.id}`)).toBeInTheDocument());
    expect(screen.queryByTestId(`adr-node-${adrBeta.adr.id}`)).not.toBeInTheDocument();
  });

  it("selecting an ADR calls onSelectAdr with its id", async () => {
    const created = await client.createAdr({ title: "Selectable ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    const onSelectAdr = vi.fn();
    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={onSelectAdr} />
    );

    await waitFor(() => expect(screen.getByTestId(`adr-select-${created.adr.id}`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`adr-select-${created.adr.id}`));

    expect(onSelectAdr).toHaveBeenCalledWith(created.adr.id);
  });

  it("renders an empty real subfolder as a node with no ADR children", async () => {
    const empty = await client.createFolder({ path: "decisions/empty-folder", author: AUTHOR });
    if (!empty.ok) throw new Error("fixture setup: createFolder unexpectedly failed");

    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByTestId("folder-node-decisions/empty-folder")).toBeInTheDocument()
    );
    const emptyNode = screen.getByTestId("folder-node-decisions/empty-folder");
    expect(within(emptyNode).queryAllByTestId(/^adr-node-/)).toHaveLength(0);
  });

  it("expand, collapse, and selection interactions on an empty folder still show it as present and empty", async () => {
    const empty = await client.createFolder({ path: "decisions/empty-folder", author: AUTHOR });
    if (!empty.ok) throw new Error("fixture setup: createFolder unexpectedly failed");

    const onSelectFolder = vi.fn();
    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={onSelectFolder} onSelectAdr={vi.fn()} />
    );

    await waitFor(() =>
      expect(screen.getByTestId("folder-node-decisions/empty-folder")).toBeInTheDocument()
    );

    // Collapse: the node and its controls stay present even though there was
    // nothing underneath it to hide.
    fireEvent.click(screen.getByTestId("folder-toggle-decisions/empty-folder"));
    expect(screen.getByTestId("folder-node-decisions/empty-folder")).toBeInTheDocument();
    expect(screen.getByTestId("folder-select-decisions/empty-folder")).toBeInTheDocument();

    // Re-expand: still shown as empty, not just present.
    fireEvent.click(screen.getByTestId("folder-toggle-decisions/empty-folder"));
    const expandedNode = screen.getByTestId("folder-node-decisions/empty-folder");
    expect(within(expandedNode).queryAllByTestId(/^adr-node-/)).toHaveLength(0);
    expect(within(expandedNode).queryAllByTestId(/^folder-node-/)).toHaveLength(0);

    // Select: scopes the tree to the empty folder itself, which remains
    // present and empty in that scoped view too.
    fireEvent.click(screen.getByTestId("folder-select-decisions/empty-folder"));
    expect(onSelectFolder).toHaveBeenCalledWith("decisions/empty-folder");

    await waitFor(() =>
      expect(screen.getByTestId("folder-node-decisions/empty-folder")).toBeInTheDocument()
    );
    const scopedNode = screen.getByTestId("folder-node-decisions/empty-folder");
    expect(within(scopedNode).queryAllByTestId(/^adr-node-/)).toHaveLength(0);
    expect(within(scopedNode).queryAllByTestId(/^folder-node-/)).toHaveLength(0);
  });

  it("creating a folder adds it to the rendered tree", async () => {
    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByTestId("folder-node-decisions")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("new-folder-path-input"), {
      target: { value: "decisions/new-folder" },
    });
    fireEvent.click(screen.getByTestId("create-folder-button"));

    await waitFor(() =>
      expect(screen.getByTestId("folder-node-decisions/new-folder")).toBeInTheDocument()
    );
  });

  it("shows the conflict message when creating a folder that already exists at that path", async () => {
    const existing = await client.createFolder({ path: "decisions/already-there", author: AUTHOR });
    if (!existing.ok) throw new Error("fixture setup: createFolder unexpectedly failed");

    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByTestId("folder-node-decisions")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("new-folder-path-input"), {
      target: { value: "decisions/already-there" },
    });
    fireEvent.click(screen.getByTestId("create-folder-button"));

    await waitFor(() => expect(screen.getByTestId("folder-conflict-message")).toBeInTheDocument());
  });

  it("moving a real ADR to a different real folder shows it under the destination after refresh", async () => {
    const destination = await client.createFolder({ path: "decisions/destination", author: AUTHOR });
    if (!destination.ok) throw new Error("fixture setup: createFolder unexpectedly failed");
    const created = await client.createAdr({ title: "Movable ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(
      <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());

    fireEvent.change(screen.getByTestId(`move-target-input-${created.adr.id}`), {
      target: { value: "decisions/destination" },
    });
    fireEvent.click(screen.getByTestId(`move-button-${created.adr.id}`));

    await waitFor(() => {
      const destinationNode = screen.getByTestId("folder-node-decisions/destination");
      expect(within(destinationNode).getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Tree View 2.0 presentation affordances (Req 5.2, 5.4, 5.5, 5.6, 10.5).
  // All driven via NEW OPTIONAL props; defaults must leave behavior unchanged.
  // ---------------------------------------------------------------------------
  describe("Tree View 2.0 presentation affordances", () => {
    it("filter narrows the visible tree to matching ADR/folder nodes while keeping ancestors of matches visible (Req 5.2)", async () => {
      const alpha = await client.createFolder({ path: "decisions/alpha", author: AUTHOR });
      if (!alpha.ok) throw new Error("fixture setup: createFolder alpha unexpectedly failed");
      const beta = await client.createFolder({ path: "decisions/beta", author: AUTHOR });
      if (!beta.ok) throw new Error("fixture setup: createFolder beta unexpectedly failed");

      const apple = await client.createAdr({ title: "Apple decision", folder: "decisions/alpha", author: AUTHOR });
      if (!apple.ok) throw new Error("fixture setup: createAdr apple unexpectedly failed");
      const banana = await client.createAdr({ title: "Banana decision", folder: "decisions/beta", author: AUTHOR });
      if (!banana.ok) throw new Error("fixture setup: createAdr banana unexpectedly failed");

      const { rerender } = render(
        <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
      );

      // With no filter, both ADRs and both folders are visible.
      await waitFor(() => expect(screen.getByTestId(`adr-node-${apple.adr.id}`)).toBeInTheDocument());
      expect(screen.getByTestId(`adr-node-${banana.adr.id}`)).toBeInTheDocument();
      expect(screen.getByTestId("folder-node-decisions/alpha")).toBeInTheDocument();
      expect(screen.getByTestId("folder-node-decisions/beta")).toBeInTheDocument();

      // Filtering on the matching ADR title narrows to just that ADR. Its
      // ancestor folder stays visible so the match remains reachable; the
      // non-matching ADR and its folder disappear.
      rerender(
        <FolderTree
          apiClient={client}
          authorName={AUTHOR}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
          filter="apple"
        />
      );

      expect(screen.getByTestId(`adr-node-${apple.adr.id}`)).toBeInTheDocument();
      expect(screen.getByTestId("folder-node-decisions/alpha")).toBeInTheDocument();
      expect(screen.queryByTestId(`adr-node-${banana.adr.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId("folder-node-decisions/beta")).not.toBeInTheDocument();
    });

    it("filter matches on folder name and keeps that folder visible (Req 5.2)", async () => {
      const alpha = await client.createFolder({ path: "decisions/alpha", author: AUTHOR });
      if (!alpha.ok) throw new Error("fixture setup: createFolder alpha unexpectedly failed");
      const beta = await client.createFolder({ path: "decisions/beta", author: AUTHOR });
      if (!beta.ok) throw new Error("fixture setup: createFolder beta unexpectedly failed");

      render(
        <FolderTree
          apiClient={client}
          authorName={AUTHOR}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
          filter="alpha"
        />
      );

      await waitFor(() => expect(screen.getByTestId("folder-node-decisions/alpha")).toBeInTheDocument());
      expect(screen.queryByTestId("folder-node-decisions/beta")).not.toBeInTheDocument();
    });

    it("an empty filter renders the full tree exactly as the default (Req 5.2)", async () => {
      const created = await client.createAdr({ title: "Unfiltered ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(
        <FolderTree
          apiClient={client}
          authorName={AUTHOR}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
          filter=""
        />
      );

      await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());
      expect(screen.getByTestId("folder-node-decisions")).toBeInTheDocument();
    });

    it("the ADR node matching selectedAdrId carries adr-node--selected and others do not (Req 5.5)", async () => {
      const first = await client.createAdr({ title: "First ADR", folder: "decisions", author: AUTHOR });
      if (!first.ok) throw new Error("fixture setup: createAdr first unexpectedly failed");
      const second = await client.createAdr({ title: "Second ADR", folder: "decisions", author: AUTHOR });
      if (!second.ok) throw new Error("fixture setup: createAdr second unexpectedly failed");

      render(
        <FolderTree
          apiClient={client}
          authorName={AUTHOR}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
          selectedAdrId={first.adr.id}
        />
      );

      await waitFor(() => expect(screen.getByTestId(`adr-node-${first.adr.id}`)).toBeInTheDocument());
      expect(screen.getByTestId(`adr-node-${first.adr.id}`).className).toContain("adr-node--selected");
      expect(screen.getByTestId(`adr-node-${second.adr.id}`).className).not.toContain("adr-node--selected");
    });

    it("renders no adr-node--selected when selectedAdrId is null/undefined (Req 5.5)", async () => {
      const created = await client.createAdr({ title: "Unselected ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(
        <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
      );

      await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());
      expect(screen.getByTestId(`adr-node-${created.adr.id}`).className).not.toContain("adr-node--selected");
    });

    it("renders a status dot per ADR node reflecting its status (Req 5.4)", async () => {
      const created = await client.createAdr({ title: "Dotted ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(
        <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
      );

      await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());
      const adrNode = screen.getByTestId(`adr-node-${created.adr.id}`);
      // A status dot reusing the existing badge structure, carrying the
      // per-status modifier so its color derives from existing tokens.
      const dot = adrNode.querySelector(".badge__dot");
      expect(dot).not.toBeNull();
      expect(adrNode.querySelector(".badge--proposed")).not.toBeNull();
    });

    it("keeps the move controls present in the DOM and wrapped for hover/focus reveal (Req 5.6, 10.5)", async () => {
      const created = await client.createAdr({ title: "Movable ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(
        <FolderTree apiClient={client} authorName={AUTHOR} onSelectFolder={vi.fn()} onSelectAdr={vi.fn()} />
      );

      await waitFor(() => expect(screen.getByTestId(`adr-node-${created.adr.id}`)).toBeInTheDocument());

      // Move hooks remain queryable (existing behavior preserved).
      const input = screen.getByTestId(`move-target-input-${created.adr.id}`);
      const button = screen.getByTestId(`move-button-${created.adr.id}`);
      expect(input).toBeInTheDocument();
      expect(button).toBeInTheDocument();

      // They live inside the hover-reveal wrapper (visual-only hiding, not
      // removed from the DOM), so keyboard focus can still reveal them.
      expect(button.closest(".folder-tree__move")).not.toBeNull();
    });
  });
});
