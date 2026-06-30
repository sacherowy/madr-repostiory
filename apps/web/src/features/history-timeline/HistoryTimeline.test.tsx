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

/**
 * Builds a full nine-field section payload for `updateAdr` fixture calls,
 * mirroring AdrEditor.test.tsx's `sectionsPayload` helper (task 16.1) so
 * fixture setup here stays consistent with the shared `AdrSections` shape
 * (8 section fields + `additionalContent`) instead of the removed `body`.
 */
function sectionsPayload(contextAndProblemStatement: string, decisionOutcome: string) {
  return {
    contextAndProblemStatement,
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome,
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
    additionalContent: "",
  };
}

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
      decisionMakers: created.adr.decisionMakers,
      tags: created.adr.tags,
      ...sectionsPayload("Updated context.", "Updated decision outcome."),
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

    // Each entry renders its blob SHA as a machine-identifier mono chip
    // (Req 6.2). The full sha stays available via the entry's data-sha, while
    // the chip surfaces it as visible monospace text.
    for (const entry of entries) {
      const sha = entry.getAttribute("data-sha");
      expect(sha).toBeTruthy();
      const chip = entry.querySelector(".mono-chip--sha");
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toBe(sha);
    }
  });

  it("selecting the oldest (create) entry on a multi-version ADR shows that version's original title/body, not the updated content", async () => {
    const created = await client.createAdr({ title: "Original title", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    const saved = await client.updateAdr(created.adr.id, {
      title: "Updated title",
      status: created.adr.status,
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      tags: created.adr.tags,
      ...sectionsPayload("Original context.", "Updated decision outcome content."),
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
    expect(content.textContent).not.toContain("Updated decision outcome content.");
  });

  it("shows the eight MADR section blocks in canonical order, each labeled, for a historical version, with no single body paragraph", async () => {
    const created = await client.createAdr({ title: "Sectioned ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    const saved = await client.updateAdr(created.adr.id, {
      title: "Sectioned ADR",
      status: created.adr.status,
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      tags: created.adr.tags,
      contextAndProblemStatement: "Context content.",
      decisionDrivers: "Driver content.",
      consideredOptions: "Options content.",
      decisionOutcome: "Outcome content.",
      consequences: "Consequence content.",
      confirmation: "Confirmation content.",
      prosAndConsOfTheOptions: "Pros and cons content.",
      moreInformation: "More info content.",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

    render(<HistoryTimeline apiClient={client} adrId={created.adr.id} />);
    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

    const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
    const sha = entries[0].getAttribute("data-sha");
    fireEvent.click(screen.getByTestId(`history-select-${sha}`));

    await waitFor(() => expect(screen.getByTestId("history-version-content")).toBeInTheDocument());

    expect(screen.queryByTestId("history-version-body")).not.toBeInTheDocument();

    const expectedOrder = [
      "context-and-problem-statement-block",
      "decision-drivers-block",
      "considered-options-block",
      "decision-outcome-block",
      "consequences-block",
      "confirmation-block",
      "pros-and-cons-of-the-options-block",
      "more-information-block",
    ];
    for (const testId of expectedOrder) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
    expect(screen.getByTestId("context-and-problem-statement-block").textContent).toContain(
      "Context content."
    );
    expect(screen.getByTestId("decision-outcome-block").textContent).toContain("Outcome content.");

    // canonical order: each subsequent testid appears later in the DOM than the previous one
    const positions = expectedOrder.map(
      (testId) => document.body.innerHTML.indexOf(`data-testid="${testId}"`)
    );
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }

    // additionalContent was empty, so its block must not render.
    expect(screen.queryByTestId("additional-content-block")).not.toBeInTheDocument();
  });

  it("shows the additional-content block only when non-empty, after the eight section blocks", async () => {
    const created = await client.createAdr({ title: "Unmapped Content ADR", folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");

    const saved = await client.updateAdr(created.adr.id, {
      title: "Unmapped Content ADR",
      status: created.adr.status,
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      tags: created.adr.tags,
      ...sectionsPayload("Context content.", "Outcome content."),
      additionalContent: "Leftover legacy text.",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");

    render(<HistoryTimeline apiClient={client} adrId={created.adr.id} />);
    await waitFor(() => expect(screen.getByTestId("history-timeline")).toBeInTheDocument());

    const entries = screen.getAllByTestId(/^history-entry-[^-]+$/);
    const sha = entries[0].getAttribute("data-sha");
    fireEvent.click(screen.getByTestId(`history-select-${sha}`));

    await waitFor(() => expect(screen.getByTestId("history-version-content")).toBeInTheDocument());

    expect(screen.getByTestId("additional-content-block")).toBeInTheDocument();
    expect(screen.getByTestId("additional-content-block").textContent).toContain(
      "Leftover legacy text."
    );

    const lastSectionPosition = document.body.innerHTML.indexOf(
      'data-testid="more-information-block"'
    );
    const additionalContentPosition = document.body.innerHTML.indexOf(
      'data-testid="additional-content-block"'
    );
    expect(additionalContentPosition).toBeGreaterThan(lastSectionPosition);
  });
});
