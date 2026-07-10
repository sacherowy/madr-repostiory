import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import type { AdrStatus } from "@adr/shared";
// Same relative-path device as the old App.test.tsx (and client.test.ts): @adr/api
// has no `exports` field, so it is reached via a relative path into its `src/`
// rather than a bare specifier. App.test.tsx lives one directory shallower than
// the feature tests, so the path has one fewer `../`.
import { buildContainer, type Container } from "../../api/src/container.js";
import { buildServer } from "../../api/src/server.js";
import { createApiClient, type ApiClient } from "./api/client.js";
import { createQueryClient } from "./state/queryClient.js";
import { usePortalStore } from "./state/portalStore.js";
import { App } from "./App.js";

const AUTHOR = "Test Author <test@example.com>";

// Track the live query client so `afterEach` can cancel in-flight queries before
// the real Fastify server is closed — the portal's App fans out several
// background requests (`useFeed`, `useDecision`'s four queries, TopicPicker's
// tree). Cancelling first lets their sockets drain so `app.close()` cannot hang.
let activeQueryClient: QueryClient | null = null;

function renderApp(ui: ReactElement) {
  const client = createQueryClient();
  activeQueryClient = client;
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("App (portal shell — task 8.1 / Req 2.1, 2.6, 15.5)", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    // portalStore has no reset() action (contract-faithful); isolate via setState
    // so navigation/author state never bleeds across tests.
    usePortalStore.setState({ view: { kind: "home" }, authorName: "" });
    activeQueryClient = null;

    repoPath = await mkdtemp(join(tmpdir(), "app-portal-"));
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
    if (activeQueryClient !== null) {
      await activeQueryClient.cancelQueries();
      activeQueryClient.clear();
    }
    app.server.closeAllConnections();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * Create + save an ADR so it (a) carries a real title/context/outcome and (b)
   * appears in the assembled feed. Mirrors HomePage.test.tsx's fixture: the
   * search index is only populated on save(), and a saved decision is a full
   * feed card.
   */
  async function seedAdr(opts: { title: string; status?: AdrStatus }): Promise<{ id: string }> {
    const created = await client.createAdr({ title: opts.title, folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const saved = await client.updateAdr(created.adr.id, {
      title: opts.title,
      status: opts.status ?? "proposed",
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      tags: created.adr.tags,
      contextAndProblemStatement: "Context and problem statement text.",
      decisionOutcome: "We proceed for now.",
      decisionDrivers: "",
      consideredOptions: "",
      consequences: "",
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

  it("lands on the Home decision feed by default, with Home marked current (Req 2.1)", async () => {
    renderApp(<App apiClient={client} />);

    expect(screen.getByTestId("top-nav")).toBeInTheDocument();
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    // Home is the current destination by default (Req 2.1).
    expect(screen.getByTestId("top-nav-home")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("top-nav-topics")).not.toHaveAttribute("aria-current");

    // Await the feed settling (empty repo → inviting empty state) so no query is
    // still in flight when the server closes.
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());
  });

  it("navigates between Home, Topics, and People via the top nav (Req 15.5 — store-driven, no router)", async () => {
    renderApp(<App apiClient={client} />);
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("top-nav-topics"));
    expect(screen.getByTestId("topics-page")).toBeInTheDocument();
    expect(screen.getByTestId("top-nav-topics")).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByTestId("topics-empty")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("top-nav-people"));
    expect(screen.getByTestId("people-page")).toBeInTheDocument();
    expect(screen.getByTestId("top-nav-people")).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByTestId("people-empty")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("top-nav-home"));
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    expect(screen.getByTestId("top-nav-home")).toHaveAttribute("aria-current", "page");
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());
  });

  it("opens the compose form from the New decision action (no destination marked current)", async () => {
    renderApp(<App apiClient={client} />);
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("top-nav-new"));

    expect(screen.getByTestId("compose-container")).toBeInTheDocument();
    // Compose is not one of the three destinations, so none is marked current.
    expect(screen.getByTestId("top-nav-home")).not.toHaveAttribute("aria-current");

    // TopicPicker fetches the tree on mount; await it settling before teardown.
    await waitFor(() => expect(screen.getByTestId("compose-container")).toBeInTheDocument());
  });

  it("reaches a decision article from a Home feed card, and toggles Technical view and back (Req 2.6)", async () => {
    const { id } = await seedAdr({ title: "Adopt event sourcing" });

    renderApp(<App apiClient={client} />);

    await waitFor(() => expect(screen.getByTestId(`home-card-${id}`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`home-card-${id}`));

    // The decision opens as the outcome-first article (Req 2.6, 6.2). The
    // article-page shell renders immediately (loading state); await the
    // outcome-first summary box, which only appears once the decision resolves.
    await waitFor(() => expect(screen.getByTestId("article-summary")).toBeInTheDocument());
    expect(screen.getByTestId("article-page")).toBeInTheDocument();
    expect(screen.getByText("Adopt event sourcing")).toBeInTheDocument();
    // No destination is current while reading an article.
    expect(screen.getByTestId("top-nav-home")).not.toHaveAttribute("aria-current");

    // The Technical-view ENTRY toggle switches into the raw record (Req 7.1).
    fireEvent.click(screen.getByTestId("article-technical-enter"));
    await waitFor(() => expect(screen.getByTestId("technical-view")).toBeInTheDocument());
    expect(screen.queryByTestId("article-page")).not.toBeInTheDocument();
    // Await the raw record settling so no `["raw", id]` query is mid-flight.
    await waitFor(() => expect(screen.getByTestId("technical-view-path")).toBeInTheDocument());

    // Returning from Technical view restores the friendly article (Req 7.5).
    fireEvent.click(screen.getByTestId("technical-view-return"));
    await waitFor(() => expect(screen.getByTestId("article-page")).toBeInTheDocument());
    expect(screen.queryByTestId("technical-view")).not.toBeInTheDocument();
  });

  it("wires the top-nav author-name field to the portal store", async () => {
    renderApp(<App apiClient={client} />);
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());

    const authorInput = screen.getByTestId("top-nav-author");
    fireEvent.change(authorInput, { target: { value: "Ada Lovelace" } });

    expect(authorInput).toHaveValue("Ada Lovelace");
    expect(usePortalStore.getState().authorName).toBe("Ada Lovelace");
  });

  it("opens a topic's feed from the Topics destination and reaches its decision (Req 2.6, 3.2)", async () => {
    const { id } = await seedAdr({ title: "Standardize on PostgreSQL" });

    renderApp(<App apiClient={client} />);
    await waitFor(() => expect(screen.getByTestId(`home-card-${id}`)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("top-nav-topics"));
    // The decision lives in "decisions", so that topic is browsable.
    await waitFor(() => expect(screen.getByTestId("topic-item-decisions")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("topic-item-decisions"));

    // The per-topic feed shows the decision; opening its card reaches the article.
    await waitFor(() => expect(screen.getByTestId("topic-feed")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Standardize on PostgreSQL"));
    await waitFor(() => expect(screen.getByTestId("article-page")).toBeInTheDocument());
  });
});
