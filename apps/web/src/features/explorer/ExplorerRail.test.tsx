import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as FolderTree.test.tsx: @adr/api has no exports
// field, so it's reached via a relative path into its src/. ExplorerRail.test
// is a sibling of FolderTree.test, so the `../` depth matches exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { ExplorerRail } from "./ExplorerRail.js";

const AUTHOR = "Test Author <test@example.com>";

/**
 * Minimal stub ApiClient whose `getTree` never resolves, so FolderTree stays in
 * its loading state. The breadcrumb renders regardless of tree state, so the
 * backend-free breadcrumb tests can lean on this stub instead of a live server.
 */
function makeLoadingClient(): ApiClient {
  return {
    getTree: () => new Promise(() => {}),
  } as unknown as ApiClient;
}

describe("ExplorerRail", () => {
  afterEach(() => {
    cleanup();
  });

  describe("breadcrumb (backend-free)", () => {
    it("splits selectedFolder on '/' into crumb segments (Req 5.3)", () => {
      render(
        <ExplorerRail
          apiClient={makeLoadingClient()}
          authorName={AUTHOR}
          selectedAdrId={null}
          selectedFolder="team/platform"
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
        />
      );

      const breadcrumb = screen.getByTestId("explorer-breadcrumb");
      expect(breadcrumb.textContent).toContain("team");
      expect(breadcrumb.textContent).toContain("platform");
    });

    it("shows a root/empty state when nothing is selected (Req 5.3)", () => {
      render(
        <ExplorerRail
          apiClient={makeLoadingClient()}
          authorName={AUTHOR}
          selectedAdrId={null}
          selectedFolder={null}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
        />
      );

      const breadcrumb = screen.getByTestId("explorer-breadcrumb");
      // Root/empty state still renders the breadcrumb region with a sensible
      // root label rather than an empty element.
      expect(breadcrumb.textContent?.trim()).not.toBe("");
    });

    it("reflects the selected ADR location when no folder is selected (Req 5.3)", () => {
      render(
        <ExplorerRail
          apiClient={makeLoadingClient()}
          authorName={AUTHOR}
          selectedAdrId="0001-some-decision"
          selectedFolder={null}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
        />
      );

      const breadcrumb = screen.getByTestId("explorer-breadcrumb");
      expect(breadcrumb.textContent).toContain("0001-some-decision");
    });
  });

  describe("filter input (backend-free)", () => {
    it("renders a labelled filter input identifiable by assistive technology (Req 9.3)", () => {
      render(
        <ExplorerRail
          apiClient={makeLoadingClient()}
          authorName={AUTHOR}
          selectedAdrId={null}
          selectedFolder={null}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
        />
      );

      const input = screen.getByTestId("explorer-filter-input");
      expect(input).toBeInTheDocument();
      // Labelled for assistive tech: a <label> associated by id resolves an
      // accessible name via getByLabelText.
      expect(screen.getByLabelText(/filter/i)).toBe(input);
    });

    it("is controlled: typing updates its own value (Req 5.2)", () => {
      render(
        <ExplorerRail
          apiClient={makeLoadingClient()}
          authorName={AUTHOR}
          selectedAdrId={null}
          selectedFolder={null}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
        />
      );

      const input = screen.getByTestId("explorer-filter-input") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "apple" } });
      expect(input.value).toBe("apple");
    });
  });

  describe("filter wiring to FolderTree (live backend)", () => {
    let repoPath: string;
    let container: Container;
    let app: FastifyInstance;
    let baseUrl: string;
    let client: ApiClient;

    afterEach(async () => {
      cleanup();
      await app.close();
      await rm(repoPath, { recursive: true, force: true });
    });

    it("typing in the filter narrows the tree FolderTree renders (Req 5.2)", async () => {
      repoPath = await mkdtemp(join(tmpdir(), "explorer-rail-"));
      const git = simpleGit(repoPath);
      await git.init();
      await git.addConfig("user.name", "Test Author");
      await git.addConfig("user.email", "test@example.com");

      container = buildContainer({
        repoPath,
        sqlitePath: join(repoPath, "test.sqlite"),
        gemini: { model: "fake-model", apiKey: "fake-key" },
      });
      await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
      app = await buildServer(container);
      baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
      client = createApiClient(baseUrl);

      const alpha = await client.createFolder({ path: "decisions/alpha", author: AUTHOR });
      if (!alpha.ok) throw new Error("fixture setup: createFolder alpha unexpectedly failed");
      const beta = await client.createFolder({ path: "decisions/beta", author: AUTHOR });
      if (!beta.ok) throw new Error("fixture setup: createFolder beta unexpectedly failed");

      const apple = await client.createAdr({ title: "Apple decision", folder: "decisions/alpha", author: AUTHOR });
      if (!apple.ok) throw new Error("fixture setup: createAdr apple unexpectedly failed");
      const banana = await client.createAdr({ title: "Banana decision", folder: "decisions/beta", author: AUTHOR });
      if (!banana.ok) throw new Error("fixture setup: createAdr banana unexpectedly failed");

      render(
        <ExplorerRail
          apiClient={client}
          authorName={AUTHOR}
          selectedAdrId={null}
          selectedFolder={null}
          onSelectFolder={vi.fn()}
          onSelectAdr={vi.fn()}
        />
      );

      // Both ADRs visible before filtering.
      await waitFor(() => expect(screen.getByTestId(`adr-node-${apple.adr.id}`)).toBeInTheDocument());
      expect(screen.getByTestId(`adr-node-${banana.adr.id}`)).toBeInTheDocument();

      // Typing the filter flows down to FolderTree, narrowing the tree.
      fireEvent.change(screen.getByTestId("explorer-filter-input"), {
        target: { value: "apple" },
      });

      expect(screen.getByTestId(`adr-node-${apple.adr.id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`adr-node-${banana.adr.id}`)).not.toBeInTheDocument();
    });
  });

  describe("FolderTree passthrough (live backend)", () => {
    let repoPath: string;
    let container: Container;
    let app: FastifyInstance;
    let baseUrl: string;
    let client: ApiClient;

    afterEach(async () => {
      cleanup();
      await app.close();
      await rm(repoPath, { recursive: true, force: true });
    });

    it("renders FolderTree and forwards onSelectAdr / selectedAdrId (Req 5.1, 5.5)", async () => {
      repoPath = await mkdtemp(join(tmpdir(), "explorer-rail-"));
      const git = simpleGit(repoPath);
      await git.init();
      await git.addConfig("user.name", "Test Author");
      await git.addConfig("user.email", "test@example.com");

      container = buildContainer({
        repoPath,
        sqlitePath: join(repoPath, "test.sqlite"),
        gemini: { model: "fake-model", apiKey: "fake-key" },
      });
      await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
      app = await buildServer(container);
      baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
      client = createApiClient(baseUrl);

      const created = await client.createAdr({ title: "Selectable ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      const onSelectAdr = vi.fn();
      render(
        <ExplorerRail
          apiClient={client}
          authorName={AUTHOR}
          selectedAdrId={created.adr.id}
          selectedFolder={null}
          onSelectFolder={vi.fn()}
          onSelectAdr={onSelectAdr}
        />
      );

      await waitFor(() => expect(screen.getByTestId("folder-tree")).toBeInTheDocument());

      const adrNode = screen.getByTestId(`adr-node-${created.adr.id}`);
      // selectedAdrId flows through to FolderTree's raised-selection treatment.
      expect(adrNode.className).toContain("adr-node--selected");

      // onSelectAdr flows through.
      fireEvent.click(within(adrNode).getByTestId(`adr-select-${created.adr.id}`));
      expect(onSelectAdr).toHaveBeenCalledWith(created.adr.id);
    });
  });
});
