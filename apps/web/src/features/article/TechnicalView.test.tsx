import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as ArticlePage.test.tsx: @adr/api has no `exports`
// field, so it is reached via a relative path into its `src/` for test-only use
// inside the pnpm workspace.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { TechnicalView } from "./TechnicalView.js";

const AUTHOR = "Test Author <test@example.com>";

/**
 * Hand-seeded raw MADR file. Committing the exact bytes (rather than going
 * through the friendly save path) gives the test full control over the
 * canonical values that must appear VERBATIM in Technical view (Req 1.6):
 * the raw `status: proposed` enum, the `supersedes` relation type, and the
 * canonical `## Context and Problem Statement` heading. `getRawAdr` returns
 * these bytes untouched, and one commit gives `HistoryTimeline` real history.
 */
const RAW_MARKDOWN = [
  "---",
  "id: tech-1",
  "status: proposed",
  'date: "2026-01-01"',
  'summary: "Weighing Postgres against DynamoDB."',
  "relations:",
  "  - type: supersedes",
  '    target: "tech-0"',
  "---",
  "# Use PostgreSQL for the customer data platform",
  "",
  "## Context and Problem Statement",
  "We must   choose a datastore.",
  "",
].join("\n");

describe("TechnicalView", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "technical-view-"));
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig("user.name", "Test Author");
    await git.addConfig("user.email", "test@example.com");
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });
    await container.git.writeAndCommit("decisions/tech-1.md", RAW_MARKDOWN, "seed raw adr", AUTHOR);
    app = await buildServer(container);
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    cleanup();
    // TechnicalView fans out several backend fetches (raw content + history +
    // the compare flows). The tests await the raw content and the history
    // timeline settling, but sibling requests can still be in flight; drop any
    // open sockets so `app.close()` never hangs (teardown-race rule, mirroring
    // ArticlePage.test.tsx / App.test.tsx).
    app.server.closeAllConnections();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  function renderTechnicalView(onClose = () => {}) {
    render(<TechnicalView apiClient={client} adrId="tech-1" onClose={onClose} />, {
      wrapper: createQueryWrapper(),
    });
  }

  it("displays the raw Markdown content and the file path (Req 7.2)", async () => {
    renderTechnicalView();

    // File path shown verbatim.
    expect(await screen.findByTestId("technical-view-path")).toHaveTextContent(
      "decisions/tech-1.md"
    );

    // Raw markdown rendered verbatim (whitespace preserved) in a <pre>.
    const raw = screen.getByTestId("technical-view-raw");
    expect(raw.tagName).toBe("PRE");
    expect(raw.textContent).toBe(RAW_MARKDOWN);
  });

  it("shows canonical status/relation values and MADR headings verbatim (Req 1.6, 7.2)", async () => {
    renderTechnicalView();

    const raw = await screen.findByTestId("technical-view-raw");
    // The plain-language layer is bypassed here: canonical enums and headings
    // appear exactly as stored, never their friendly labels.
    expect(raw.textContent).toContain("status: proposed");
    expect(raw.textContent).toContain("type: supersedes");
    expect(raw.textContent).toContain("## Context and Problem Statement");
    // The plain-language labels ("In discussion", "Replaces") are NOT applied here.
    expect(raw.textContent).not.toContain("In discussion");
    expect(raw.textContent).not.toContain("Replaces");
  });

  it("reuses the existing history/diff timeline for the real git history (Req 7.3)", async () => {
    renderTechnicalView();

    // HistoryTimeline is mounted (its own testid) and loads the real commit.
    expect(await screen.findByTestId("history-timeline")).toBeInTheDocument();
    // The seeding commit's message appears, proving real git history is shown.
    expect(await screen.findByText("seed raw adr")).toBeInTheDocument();
  });

  it("offers the ADR-to-ADR comparison entry, reusing the existing compare components (Req 7.3, 7.4)", async () => {
    renderTechnicalView();

    await screen.findByTestId("technical-view-raw");
    // CompareLauncher (which itself hosts VersionDiffView for version diffs and
    // AdrCompareView for ADR-to-ADR comparison) is mounted and reused as-is.
    expect(screen.getByTestId("compare-launcher")).toBeInTheDocument();
    expect(screen.getByTestId("compare-version-section")).toBeInTheDocument();
    expect(screen.getByTestId("compare-adr-section")).toBeInTheDocument();
  });

  it("presents a return toggle that exits back to the article (Req 7.5)", async () => {
    const onClose = vi.fn();
    renderTechnicalView(onClose);

    await screen.findByTestId("technical-view-raw");

    const toggle = screen.getByTestId("technical-view-return");
    fireEvent.click(toggle);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an error state when the raw content cannot be loaded", async () => {
    render(<TechnicalView apiClient={client} adrId="does-not-exist" onClose={() => {}} />, {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByTestId("technical-view-raw-error")).toBeInTheDocument();
    // The return toggle stays available even in the error state (Req 7.5).
    expect(screen.getByTestId("technical-view-return")).toBeInTheDocument();
  });
});
