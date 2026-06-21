import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as apps/web/src/features/relations-graph/RelationsPanel.test.tsx
// (task 5.3): @adr/api has no exports field, so it's reached via a relative
// path into its src/ rather than a bare specifier. HistoryTimeline.test.tsx is
// a sibling of RelationsPanel.test.tsx, FolderTree.test.tsx, and
// AdrEditor.test.tsx, so the `../` depth matches exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { HistoryTimeline } from "./HistoryTimeline.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "history-timeline-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("HistoryTimeline", () => {
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

  it("shows history-timeline-loading then exactly one entry for a single-version ADR, with no implication of further history", async () => {
    const created = await client.createAdr({ title: "Single version ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    render(<HistoryTimeline apiClient={client} adrId={created.adr.id} />);

    expect(screen.getByTestId("history-timeline-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

    const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain(`create ${created.adr.id}`);
    expect(entries[0].textContent).toContain("Test Author");
  });

  it("shows the error state for a nonexistent ADR id", async () => {
    render(<HistoryTimeline apiClient={client} adrId="adr-9999" />);

    expect(screen.getByTestId("history-timeline-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("history-timeline-error")).toBeInTheDocument());
  });

  it("shows exactly two entries newest-first for a multi-version ADR, each with real author/date/message", async () => {
    const created = await client.createAdr({ title: "Multi version ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    const saved = await client.updateAdr(created.adr.id, {
      title: "Multi version ADR (updated)",
      status: created.adr.status,
      date: created.adr.date,
      deciders: created.adr.deciders,
      tags: created.adr.tags,
      body: "Updated body.",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

    render(<HistoryTimeline apiClient={client} adrId={created.adr.id} />);

    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

    const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
    expect(entries).toHaveLength(2);

    // Newest first: the first rendered entry corresponds to the save, the
    // second to the create — mirroring history.test.ts's own assertion style.
    expect(entries[0].textContent).toContain(`save ${created.adr.id}`);
    expect(entries[0].textContent).toContain("Test Author");
    expect(entries[1].textContent).toContain(`create ${created.adr.id}`);
    expect(entries[1].textContent).toContain("Test Author");
  });

  it("selecting the oldest (create) entry on a multi-version ADR shows that version's original title/body, not the updated content", async () => {
    const created = await client.createAdr({ title: "Original title", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    const saved = await client.updateAdr(created.adr.id, {
      title: "Updated title",
      status: created.adr.status,
      date: created.adr.date,
      deciders: created.adr.deciders,
      tags: created.adr.tags,
      body: "Updated body content.",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

    render(<HistoryTimeline apiClient={client} adrId={created.adr.id} />);

    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

    const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
    expect(entries).toHaveLength(2);
    // entries[1] is the oldest (create) entry per the newest-first contract.
    const oldestSha = entries[1].getAttribute("data-sha");
    expect(oldestSha).toBeTruthy();

    fireEvent.click(screen.getByTestId(`history-select-${oldestSha}`));

    await waitFor(() => expect(screen.getByTestId("history-version-content")).toBeInTheDocument());
    const content = screen.getByTestId("history-version-content");
    expect(content.textContent).toContain("Original title");
    expect(content.textContent).not.toContain("Updated title");
    expect(content.textContent).not.toContain("Updated body content.");
  });
});
