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
});
