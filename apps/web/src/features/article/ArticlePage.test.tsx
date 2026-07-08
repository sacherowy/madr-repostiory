import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { PEOPLE_LABELS, STATUS_LABELS, type AdrStatus } from "@adr/shared";
// Same relative-path device as HomePage.test.tsx: @adr/api has no `exports`
// field, so it is reached via a relative path into its `src/` for test-only use
// inside the pnpm workspace. ArticlePage.test.tsx lives at the same depth as
// HomePage.test.tsx (features/article vs features/home).
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { ArticlePage } from "./ArticlePage.js";

const AUTHOR = "Test Author <test@example.com>";

describe("ArticlePage", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "article-page-"));
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig("user.name", "Test Author");
    await git.addConfig("user.email", "test@example.com");
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });
    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
    app = await buildServer(container);
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    cleanup();
    // ArticlePage drives useDecision, which fans out four parallel queries (adr,
    // relations, history, similar). The tests await the article's title/summary
    // (the adr query) but the sibling queries can still be in flight; proactively
    // drop any open sockets so `app.close()` does not hang on one, mirroring
    // App.test.tsx's teardown for multi-query views.
    app.server.closeAllConnections();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * Create an ADR and save it with sections, people, status, and outcome via the
   * existing update path (create() then update()), mirroring HomePage.test.tsx's
   * fixture. Fields left unset default to empty strings so per-test overrides stay
   * focused.
   */
  async function seedAdr(opts: {
    title: string;
    status?: AdrStatus;
    contextAndProblemStatement?: string;
    decisionDrivers?: string;
    consideredOptions?: string;
    decisionOutcome?: string;
    consequences?: string;
    decisionMakers?: string[];
    consulted?: string[];
    informed?: string[];
  }): Promise<{ id: string }> {
    const created = await client.createAdr({ title: opts.title, folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const saved = await client.updateAdr(created.adr.id, {
      title: opts.title,
      status: opts.status ?? "proposed",
      date: created.adr.date,
      decisionMakers: opts.decisionMakers ?? [],
      consulted: opts.consulted ?? [],
      informed: opts.informed ?? [],
      // contextAndProblemStatement and decisionOutcome are required by the save
      // path for every status, so default them non-empty; tests override when the
      // exact body text matters.
      contextAndProblemStatement:
        opts.contextAndProblemStatement ?? "Context and problem statement text.",
      decisionDrivers: opts.decisionDrivers ?? "",
      consideredOptions: opts.consideredOptions ?? "",
      decisionOutcome: opts.decisionOutcome ?? "We proceed for now.",
      consequences: opts.consequences ?? "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!saved.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
    return { id: created.adr.id };
  }

  function renderArticle(id: string, props?: Partial<React.ComponentProps<typeof ArticlePage>>) {
    render(<ArticlePage apiClient={client} adrId={id} {...props} />, {
      wrapper: createQueryWrapper(),
    });
  }

  it("presents the decision as an article with a prominent title and plain-language status (Req 6.1)", async () => {
    const { id } = await seedAdr({
      title: "Use PostgreSQL for the customer data platform",
      status: "accepted",
      decisionOutcome: 'Chosen option: "PostgreSQL", because our reporting needs relational queries.',
    });

    renderArticle(id);

    // The article is present with the title as the page heading (Req 6.1).
    const title = await screen.findByRole("heading", {
      level: 1,
      name: "Use PostgreSQL for the customer data platform",
    });
    expect(title).toBeInTheDocument();
    expect(screen.getByTestId("article-page")).toBeInTheDocument();

    // Status shows the plain-language label ("Decided"), never the raw enum.
    const status = screen.getByTestId("article-status");
    expect(status).toHaveTextContent(STATUS_LABELS.accepted);
    expect(status.textContent).not.toContain("accepted");
  });

  it("leads with an outcome-first summary box stating the short description before any section content (Req 6.2)", async () => {
    const { id } = await seedAdr({
      title: "Use PostgreSQL",
      status: "accepted",
      contextAndProblemStatement: "The customer data platform must store profile data for millions of customers.",
      decisionOutcome: 'Chosen option: "PostgreSQL", because reporting needs relational queries.',
    });

    renderArticle(id);

    // Wait for the article to settle (adr query done) before asserting/teardown.
    await screen.findByRole("heading", { level: 1, name: "Use PostgreSQL" });

    // The outcome-first summary box states the derived one-line short description
    // (accepted + canonical outcome → "We chose PostgreSQL — <reason>").
    const summary = screen.getByTestId("article-summary");
    expect(summary).toHaveTextContent(/We chose PostgreSQL/);

    // It leads the page: the summary box appears BEFORE the section content
    // region in document order (Req 6.2 "before any other section content").
    const sections = screen.getByTestId("article-sections");
    expect(summary.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders each non-empty MADR section under a friendly name carrying the canonical MADR heading as a tag (Req 6.3)", async () => {
    const { id } = await seedAdr({
      title: "Use PostgreSQL",
      status: "accepted",
      contextAndProblemStatement: "The current spreadsheet approach cannot pass audit.",
      decisionDrivers: "Reporting teams need ad-hoc queries.",
      decisionOutcome: 'Chosen option: "PostgreSQL", because it fits reporting.',
      consequences: "Reporting can self-serve going forward.",
    });

    renderArticle(id);
    await screen.findByRole("heading", { level: 1, name: "Use PostgreSQL" });

    // The context section renders under the friendly name with the canonical
    // MADR heading shown as a subtle tag alongside it.
    const contextSection = screen.getByTestId("article-section-contextAndProblemStatement");
    expect(within(contextSection).getByText("Why we needed to decide")).toBeInTheDocument();
    const tag = within(contextSection).getByTestId("article-section-tag-contextAndProblemStatement");
    expect(tag).toHaveTextContent("Context and Problem Statement");
    // The stored section body is present.
    expect(contextSection).toHaveTextContent("cannot pass audit");

    // Another non-empty section carries its own friendly name + canonical tag.
    const consequences = screen.getByTestId("article-section-consequences");
    expect(within(consequences).getByText("What this means for us")).toBeInTheDocument();
    expect(
      within(consequences).getByTestId("article-section-tag-consequences")
    ).toHaveTextContent("Consequences");

    // Empty sections (e.g. Confirmation was left blank) are not rendered.
    expect(screen.queryByTestId("article-section-confirmation")).not.toBeInTheDocument();
  });

  it("renders people under their plain-language labels (Req 6.6)", async () => {
    const { id } = await seedAdr({
      title: "Use PostgreSQL",
      status: "accepted",
      decisionOutcome: 'Chosen option: "PostgreSQL", because it fits.',
      decisionMakers: ["Marta Kowalska"],
      consulted: ["Platform team"],
      informed: ["Reporting team"],
    });

    renderArticle(id);
    await screen.findByRole("heading", { level: 1, name: "Use PostgreSQL" });

    const people = screen.getByTestId("article-people");
    // Plain-language labels from PEOPLE_LABELS, never the stored field names.
    expect(people).toHaveTextContent(PEOPLE_LABELS.decisionMakers);
    expect(people).toHaveTextContent(PEOPLE_LABELS.consulted);
    expect(people).toHaveTextContent(PEOPLE_LABELS.informed);
    expect(people.textContent).not.toContain("decisionMakers");
    // The stored names appear under their labels.
    expect(people).toHaveTextContent("Marta Kowalska");
    expect(people).toHaveTextContent("Platform team");
    expect(people).toHaveTextContent("Reporting team");
  });

  it("exposes additive mount slots for the option compare cards and context rail (6.2 / 6.3 seams)", async () => {
    const { id } = await seedAdr({
      title: "Use PostgreSQL",
      status: "accepted",
      decisionOutcome: 'Chosen option: "PostgreSQL", because it fits.',
    });

    renderArticle(id, {
      optionCompareCards: <div data-testid="provided-option-compare">Compare cards</div>,
      contextRail: <div data-testid="provided-context-rail">Context rail</div>,
    });
    await screen.findByRole("heading", { level: 1, name: "Use PostgreSQL" });

    // Provided slot content mounts into the article's dedicated slots additively.
    expect(screen.getByTestId("article-option-compare-slot")).toContainElement(
      screen.getByTestId("provided-option-compare")
    );
    expect(screen.getByTestId("article-context-rail-slot")).toContainElement(
      screen.getByTestId("provided-context-rail")
    );
  });

  it("renders empty mount slots when no slot content is provided (stable additive seam)", async () => {
    const { id } = await seedAdr({
      title: "Use PostgreSQL",
      status: "accepted",
      decisionOutcome: 'Chosen option: "PostgreSQL", because it fits.',
    });

    renderArticle(id);
    await screen.findByRole("heading", { level: 1, name: "Use PostgreSQL" });

    expect(screen.getByTestId("article-option-compare-slot")).toBeEmptyDOMElement();
    expect(screen.getByTestId("article-context-rail-slot")).toBeEmptyDOMElement();
  });
});
