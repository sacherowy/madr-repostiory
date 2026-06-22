import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as VersionDiffView.test.tsx/AdrCompareView.test.tsx
// (task 5.5): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. CompareLauncher.test.tsx
// is a sibling of those two files, so the `../` depth matches.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { CompareLauncher } from "./CompareLauncher.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "compare-launcher-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("CompareLauncher", () => {
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

  async function loadHistoryFor(id: string) {
    fireEvent.change(screen.getByTestId("compare-version-adr-id-input"), { target: { value: id } });
    fireEvent.click(screen.getByTestId("compare-version-load-history-button"));
  }

  describe("version-to-version sub-flow", () => {
    it("renders a real version-diff (not rejection/error) when From/To are marked on the same ADR's history, matching a direct client.getVersionDiff call", async () => {
      const created = await client.createAdr({ title: "Two-version ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      const saved = await client.updateAdr(created.adr.id, {
        title: created.adr.title,
        status: created.adr.status,
        date: created.adr.date,
        deciders: created.adr.deciders,
        tags: created.adr.tags,
        body: "Completely different body content.",
        author: AUTHOR,
        baseBlobSha: created.adr.blobSha,
      });
      if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

      render(<CompareLauncher apiClient={client} />);

      await loadHistoryFor(created.adr.id);

      await waitFor(() =>
        expect(screen.getAllByTestId(/^compare-version-history-entry-/)).toHaveLength(2)
      );

      const history = await client.getHistory(created.adr.id);
      if (!history.ok) throw new Error("fixture setup: getHistory unexpectedly failed");
      const toSha = history.history[0].sha; // save (newest)
      const fromSha = history.history[1].sha; // create (oldest)

      fireEvent.click(screen.getByTestId(`compare-version-mark-from-${fromSha}`));
      fireEvent.click(screen.getByTestId(`compare-version-mark-to-${toSha}`));

      expect(screen.getByTestId("compare-version-from-selected").textContent).toContain(fromSha);
      expect(screen.getByTestId("compare-version-to-selected").textContent).toContain(toSha);

      await waitFor(() => expect(screen.getByTestId("version-diff")).toBeInTheDocument());
      expect(screen.queryByTestId("version-diff-rejection")).not.toBeInTheDocument();

      const allHunks = screen.getAllByTestId(/^version-diff-hunk-\d+-(added|removed|unchanged)$/);
      expect(allHunks.length).toBeGreaterThan(0);

      const direct = await client.getVersionDiff(created.adr.id, fromSha, toSha);
      if (!direct.ok) throw new Error("fixture setup: direct getVersionDiff unexpectedly failed");
      expect(allHunks).toHaveLength(direct.diff.hunks.length);
    });

    it("shows version-diff-rejection when only one version is marked (From only, no To)", async () => {
      const created = await client.createAdr({ title: "Single mark ADR", folder: "decisions", author: AUTHOR });
      if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(<CompareLauncher apiClient={client} />);

      await loadHistoryFor(created.adr.id);

      await waitFor(() =>
        expect(screen.getAllByTestId(/^compare-version-history-entry-/)).toHaveLength(1)
      );

      const history = await client.getHistory(created.adr.id);
      if (!history.ok) throw new Error("fixture setup: getHistory unexpectedly failed");
      const sha = history.history[0].sha;

      fireEvent.click(screen.getByTestId(`compare-version-mark-from-${sha}`));

      await waitFor(() => expect(screen.getByTestId("version-diff-rejection")).toBeInTheDocument());
      expect(screen.queryByTestId("version-diff")).not.toBeInTheDocument();
    });

    it("shows version-diff-rejection (real backend 400) when From and To are marked on two different ADRs' histories", async () => {
      const a = await client.createAdr({ title: "ADR A for cross-diff", folder: "decisions", author: AUTHOR });
      if (!a.ok) throw new Error("fixture setup: createAdr A unexpectedly failed");
      const b = await client.createAdr({ title: "ADR B for cross-diff", folder: "decisions", author: AUTHOR });
      if (!b.ok) throw new Error("fixture setup: createAdr B unexpectedly failed");

      render(<CompareLauncher apiClient={client} />);

      await loadHistoryFor(a.adr.id);
      await waitFor(() =>
        expect(screen.getAllByTestId(/^compare-version-history-entry-/)).toHaveLength(1)
      );
      const aHistory = await client.getHistory(a.adr.id);
      if (!aHistory.ok) throw new Error("fixture setup: getHistory A unexpectedly failed");
      const aSha = aHistory.history[0].sha;
      fireEvent.click(screen.getByTestId(`compare-version-mark-from-${aSha}`));

      await loadHistoryFor(b.adr.id);
      await waitFor(() =>
        expect(screen.getAllByTestId(/^compare-version-history-entry-/)).toHaveLength(1)
      );
      const bHistory = await client.getHistory(b.adr.id);
      if (!bHistory.ok) throw new Error("fixture setup: getHistory B unexpectedly failed");
      const bSha = bHistory.history[0].sha;
      fireEvent.click(screen.getByTestId(`compare-version-mark-to-${bSha}`));

      // Both selections persist independently with their own remembered
      // adrId even though the displayed history list has since moved on to B.
      expect(screen.getByTestId("compare-version-from-selected").textContent).toContain(aSha);
      expect(screen.getByTestId("compare-version-to-selected").textContent).toContain(bSha);

      await waitFor(() => expect(screen.getByTestId("version-diff-rejection")).toBeInTheDocument());
      expect(screen.queryByTestId("version-diff")).not.toBeInTheDocument();
    });

    it("shows compare-version-history-error when loading history throws", async () => {
      const throwingClient: ApiClient = {
        ...client,
        getHistory: vi.fn().mockRejectedValue(new Error("network down")),
      };

      render(<CompareLauncher apiClient={throwingClient} />);

      fireEvent.change(screen.getByTestId("compare-version-adr-id-input"), { target: { value: "adr-9999" } });
      fireEvent.click(screen.getByTestId("compare-version-load-history-button"));

      await waitFor(() => expect(screen.getByTestId("compare-version-history-error")).toBeInTheDocument());
      expect(screen.queryByTestId(/^compare-version-history-entry-/)).not.toBeInTheDocument();
    });
  });

  describe("ADR-to-ADR sub-flow", () => {
    it("renders a real adr-compare table after submitting two distinct ADR ids", async () => {
      const a = await client.createAdr({ title: "Compare A title", folder: "decisions", author: AUTHOR });
      if (!a.ok) throw new Error("fixture setup: createAdr A unexpectedly failed");
      const b = await client.createAdr({ title: "Compare B title", folder: "decisions", author: AUTHOR });
      if (!b.ok) throw new Error("fixture setup: createAdr B unexpectedly failed");

      render(<CompareLauncher apiClient={client} />);

      fireEvent.change(screen.getByTestId("compare-adr-id-a-input"), { target: { value: a.adr.id } });
      fireEvent.change(screen.getByTestId("compare-adr-id-b-input"), { target: { value: b.adr.id } });
      fireEvent.click(screen.getByTestId("compare-adr-submit-button"));

      await waitFor(() => expect(screen.getByTestId("adr-compare")).toBeInTheDocument());

      expect(screen.getByTestId("adr-compare-field-title").textContent).toContain("Compare A title");
      expect(screen.getByTestId("adr-compare-field-title").textContent).toContain("Compare B title");
      expect(screen.getByTestId("adr-compare-field-title").getAttribute("data-differs")).toBe("true");
    });

    it("shows adr-compare-rejection (real backend 400) when the same ADR id is submitted in both fields", async () => {
      const a = await client.createAdr({ title: "Self compare ADR", folder: "decisions", author: AUTHOR });
      if (!a.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

      render(<CompareLauncher apiClient={client} />);

      fireEvent.change(screen.getByTestId("compare-adr-id-a-input"), { target: { value: a.adr.id } });
      fireEvent.change(screen.getByTestId("compare-adr-id-b-input"), { target: { value: a.adr.id } });
      fireEvent.click(screen.getByTestId("compare-adr-submit-button"));

      await waitFor(() => expect(screen.getByTestId("adr-compare-rejection")).toBeInTheDocument());
      expect(screen.queryByTestId("adr-compare")).not.toBeInTheDocument();
    });

    it("does not render AdrCompareView before the Compare ADRs button is ever clicked", async () => {
      render(<CompareLauncher apiClient={client} />);

      fireEvent.change(screen.getByTestId("compare-adr-id-a-input"), { target: { value: "adr-1" } });
      fireEvent.change(screen.getByTestId("compare-adr-id-b-input"), { target: { value: "adr-2" } });

      expect(screen.queryByTestId("adr-compare")).not.toBeInTheDocument();
      expect(screen.queryByTestId("adr-compare-loading")).not.toBeInTheDocument();
      expect(screen.queryByTestId("adr-compare-rejection")).not.toBeInTheDocument();
    });
  });
});
