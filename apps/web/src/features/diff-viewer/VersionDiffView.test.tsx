import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/features/history-timeline/HistoryTimeline.test.tsx
// (task 5.4): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. VersionDiffView.test.tsx
// lives at the same nesting depth as HistoryTimeline.test.tsx/
// RelationsPanel.test.tsx/FolderTree.test.tsx, so the `../` depth matches.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { VersionDiffView } from "./VersionDiffView.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "version-diff-view-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("VersionDiffView", () => {
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

  it("renders distinguishable added/removed hunks (vs unchanged) for a real two-version ADR", async () => {
    const created = await client.createAdr({ title: "Diffed ADR", folder: "decisions", author: AUTHOR });
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

    const history = await client.getHistory(created.adr.id);
    if (!history.ok) throw new Error("fixture setup: getHistory unexpectedly failed");
    expect(history.history).toHaveLength(2);
    const toSha = history.history[0].sha; // save (newest)
    const fromSha = history.history[1].sha; // create (oldest)

    render(<VersionDiffView apiClient={client} adrId={created.adr.id} fromSha={fromSha} toSha={toSha} />);

    expect(screen.getByTestId("version-diff-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("version-diff")).toBeInTheDocument());

    const addedOrRemoved = [
      ...screen.queryAllByTestId(/^version-diff-hunk-\d+-added$/),
      ...screen.queryAllByTestId(/^version-diff-hunk-\d+-removed$/),
    ];
    expect(addedOrRemoved.length).toBeGreaterThan(0);

    // Every hunk rendered must carry a kind-tagged data-testid distinguishing
    // added/removed/unchanged from one another (Req 7.2's structural
    // distinction, satisfied without CSS per the established convention).
    // The testid suffix and the data-kind attribute must agree (not just
    // each independently be a valid kind) so a hunk can't be mistagged.
    const allHunks = screen.getAllByTestId(/^version-diff-hunk-\d+-(added|removed|unchanged)$/);
    expect(allHunks.length).toBeGreaterThan(0);
    for (const hunk of allHunks) {
      const kindFromTestId = hunk.getAttribute("data-testid")!.split("-").pop();
      expect(hunk.getAttribute("data-kind")).toBe(kindFromTestId);
    }
  });

  it("shows the rejection state with no comparison content when only one version is selected (toSha undefined)", async () => {
    const created = await client.createAdr({ title: "Single selection ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(<VersionDiffView apiClient={client} adrId={created.adr.id} fromSha={created.adr.blobSha} toSha={undefined} />);

    expect(screen.getByTestId("version-diff-rejection")).toBeInTheDocument();
    expect(screen.queryByTestId("version-diff")).not.toBeInTheDocument();
    expect(screen.queryByTestId("version-diff-loading")).not.toBeInTheDocument();
  });

  it("shows the rejection state with no comparison content when fromSha is undefined", async () => {
    const created = await client.createAdr({ title: "Missing from ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(<VersionDiffView apiClient={client} adrId={created.adr.id} fromSha={undefined} toSha={created.adr.blobSha} />);

    expect(screen.getByTestId("version-diff-rejection")).toBeInTheDocument();
    expect(screen.queryByTestId("version-diff")).not.toBeInTheDocument();
  });

  it("shows the backend's real cross-ADR rejection reason when fromSha/toSha belong to two different ADRs", async () => {
    const a = await client.createAdr({ title: "ADR A for cross-diff", folder: "decisions", author: AUTHOR });
    if (!a.ok) throw new Error("fixture setup: createAdr A unexpectedly failed");
    const b = await client.createAdr({ title: "ADR B for cross-diff", folder: "decisions", author: AUTHOR });
    if (!b.ok) throw new Error("fixture setup: createAdr B unexpectedly failed");

    const aHistory = await client.getHistory(a.adr.id);
    if (!aHistory.ok) throw new Error("fixture setup: getHistory A unexpectedly failed");
    const bHistory = await client.getHistory(b.adr.id);
    if (!bHistory.ok) throw new Error("fixture setup: getHistory B unexpectedly failed");

    const aSha = aHistory.history[0].sha;
    const bSha = bHistory.history[0].sha;

    render(<VersionDiffView apiClient={client} adrId={a.adr.id} fromSha={aSha} toSha={bSha} />);

    await waitFor(() => expect(screen.getByTestId("version-diff-rejection")).toBeInTheDocument());
    expect(screen.queryByTestId("version-diff")).not.toBeInTheDocument();
    expect(screen.getByTestId("version-diff-rejection").textContent).toContain(
      "the two versions must both belong to the same ADR"
    );
  });
});
