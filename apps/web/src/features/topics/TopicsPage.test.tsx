import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import type { FeedCard as FeedCardModel } from "@adr/shared";
// Same relative-path device as HomePage.test.tsx: @adr/api has no `exports`
// field, so it is reached via a relative path into its `src/` for test-only use
// inside the pnpm workspace. features/topics sits at the same depth as
// features/home, so the `../` depth matches HomePage.test.tsx exactly.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { TopicsPage, deriveTopics, filterCardsForTopic } from "./TopicsPage.js";

const AUTHOR = "Test Author <test@example.com>";
const NOW = new Date("2026-07-08T12:00:00Z");

/** Minimal FeedCard for the pure-helper unit tests (no backend needed). */
function card(id: string, topic: string): FeedCardModel {
  return {
    id,
    title: `Decision ${id}`,
    status: "proposed",
    path: topic === "" ? `${id}.md` : `${topic}/${id}.md`,
    topic,
    date: "2026-01-01",
    decisionMakers: [],
    consulted: [],
    informed: [],
    shortDescription: { text: `About ${id}.`, source: "derived" },
  };
}

describe("topics projection helpers (pure)", () => {
  it("derives every folder as a topic, including nested folders as sub-topics with ancestors (Req 3.1)", () => {
    const cards = [card("A", "backend"), card("B", "backend/api"), card("C", "frontend")];
    const topics = deriveTopics(cards);
    const paths = topics.map((t) => t.path);
    // The intermediate "backend" ancestor is present even though B lives one
    // level deeper, and "backend/api" is listed as its sub-topic.
    expect(paths).toContain("backend");
    expect(paths).toContain("backend/api");
    expect(paths).toContain("frontend");

    const sub = topics.find((t) => t.path === "backend/api");
    const parent = topics.find((t) => t.path === "backend");
    expect(sub?.depth).toBe(1);
    expect(parent?.depth).toBe(0);
  });

  it("counts a topic's decisions including its sub-topics via path-prefix match (Req 3.2)", () => {
    const cards = [card("A", "backend"), card("B", "backend/api"), card("C", "frontend")];
    const topics = deriveTopics(cards);
    const backend = topics.find((t) => t.path === "backend");
    // "backend" totals both its own card and the sub-topic card; "frontend" only its own.
    expect(backend?.totalCount).toBe(2);
    expect(backend?.directCount).toBe(1);
  });

  it("treats the repository root ('' topic) as its own topic, not an ancestor of named folders", () => {
    const cards = [card("A", ""), card("B", "backend")];
    const topics = deriveTopics(cards);
    const root = topics.find((t) => t.path === "");
    expect(root).toBeDefined();
    expect(root?.name).toBe("General");
    // Root cards are not swept into a named topic's prefix filter.
    expect(filterCardsForTopic(cards, "backend").map((c) => c.id)).toEqual(["B"]);
    expect(filterCardsForTopic(cards, "").map((c) => c.id)).toEqual(["A"]);
  });
});

describe("TopicsPage (real backend)", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "topics-page-"));
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
    const baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    cleanup();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function seedAdr(title: string, folder: string): Promise<string> {
    const created = await client.createAdr({ title, folder, author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    return created.adr.id;
  }

  function renderTopics(props?: Partial<React.ComponentProps<typeof TopicsPage>>) {
    const onSelectTopic = props?.onSelectTopic ?? vi.fn();
    const onOpenDecision = props?.onOpenDecision ?? vi.fn();
    render(
      <TopicsPage
        apiClient={client}
        onSelectTopic={onSelectTopic}
        onOpenDecision={onOpenDecision}
        now={NOW}
        {...props}
      />,
      { wrapper: createQueryWrapper() }
    );
    return { onSelectTopic, onOpenDecision };
  }

  it("lists every folder as a topic, including nested sub-topics (Req 1.3, 3.1)", async () => {
    await seedAdr("Message bus", "backend");
    await seedAdr("Rate limiting", "backend/api");
    await seedAdr("Design tokens", "frontend");

    renderTopics();

    await waitFor(() => expect(screen.getByTestId("topic-item-backend")).toBeInTheDocument());
    // The nested folder shows up as a browsable sub-topic marked one level deep.
    const sub = screen.getByTestId("topic-item-backend/api");
    expect(sub).toBeInTheDocument();
    expect(sub).toHaveAttribute("data-depth", "1");
    expect(screen.getByTestId("topic-item-frontend")).toBeInTheDocument();
  });

  it("shows a topic's decisions including its sub-topics when selected (Req 3.2)", async () => {
    await seedAdr("Message bus", "backend");
    await seedAdr("Rate limiting", "backend/api");
    await seedAdr("Design tokens", "frontend");

    renderTopics({ selectedTopic: "backend" });

    // Both the direct "backend" decision and the "backend/api" sub-topic decision appear.
    await waitFor(() => expect(screen.getByText("Message bus")).toBeInTheDocument());
    expect(screen.getByText("Rate limiting")).toBeInTheDocument();
    // A decision from an unrelated topic is excluded.
    expect(screen.queryByText("Design tokens")).not.toBeInTheDocument();
  });

  it("scopes a sub-topic selection to just that sub-topic (Req 3.2)", async () => {
    await seedAdr("Message bus", "backend");
    await seedAdr("Rate limiting", "backend/api");

    renderTopics({ selectedTopic: "backend/api" });

    await waitFor(() => expect(screen.getByText("Rate limiting")).toBeInTheDocument());
    expect(screen.queryByText("Message bus")).not.toBeInTheDocument();
  });

  it("shows an empty state (not a blank feed) for a topic with no decisions (Req 3.4)", async () => {
    await seedAdr("Message bus", "backend");

    // A topic path that matches no decisions renders the empty-topic state.
    renderTopics({ selectedTopic: "frontend" });

    await waitFor(() => expect(screen.getByTestId("topic-empty")).toBeInTheDocument());
    // It invites the reader rather than dead-ending on a blank feed.
    expect(screen.getByTestId("topic-empty")).toHaveTextContent(/no decisions/i);
  });

  it("navigates into a topic when its list entry is selected (Req 3.1 → 3.2 wiring)", async () => {
    await seedAdr("Message bus", "backend");
    const onSelectTopic = vi.fn();
    renderTopics({ onSelectTopic });

    await waitFor(() => expect(screen.getByTestId("topic-item-backend")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("topic-item-backend"));
    expect(onSelectTopic).toHaveBeenCalledWith("backend");
  });

  it("opens a decision from within a topic's feed (Req 2.6 pattern reused)", async () => {
    const id = await seedAdr("Message bus", "backend");
    const onOpenDecision = vi.fn();
    renderTopics({ selectedTopic: "backend", onOpenDecision });

    await waitFor(() => expect(screen.getByText("Message bus")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Message bus/i }));
    expect(onOpenDecision).toHaveBeenCalledWith(id);
  });

  it("shows an inviting empty state when there are no topics at all", async () => {
    renderTopics();
    await waitFor(() => expect(screen.getByTestId("topics-empty")).toBeInTheDocument());
    const empty = screen.getByTestId("topics-empty");
    expect(within(empty).getByText(/no topics/i)).toBeInTheDocument();
  });
});
