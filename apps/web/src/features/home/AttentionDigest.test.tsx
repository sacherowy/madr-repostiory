import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import type { AdrStatus, FeedCard as FeedCardModel } from "@adr/shared";
// Same relative-path device as HomePage.test.tsx/PeoplePage.test.tsx (see their
// notes): @adr/api has no `exports` field, so it is reached via a relative path
// into its `src/` for test-only use inside the pnpm workspace.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { usePortalStore } from "../../state/portalStore.js";
import { AttentionDigest, filterAttentionCards } from "./AttentionDigest.js";

const AUTHOR = "Test Author <test@example.com>";
const NOW = new Date("2026-07-08T12:00:00Z");

/** Minimal FeedCard for the pure-helper unit tests (no backend needed). */
function card(
  id: string,
  status: AdrStatus,
  people: { decisionMakers?: string[]; consulted?: string[]; informed?: string[] }
): FeedCardModel {
  return {
    id,
    title: `Decision ${id}`,
    status,
    path: `${id}.md`,
    topic: "",
    date: "2026-01-01",
    decisionMakers: people.decisionMakers ?? [],
    consulted: people.consulted ?? [],
    informed: people.informed ?? [],
    shortDescription: { text: `About ${id}.`, source: "derived" },
  };
}

describe("attention digest matching (pure)", () => {
  it("selects only In-discussion (proposed) decisions where the author is named (Req 5.1)", () => {
    const cards = [
      card("A", "proposed", { decisionMakers: ["Marta"] }),
      card("B", "accepted", { decisionMakers: ["Marta"] }), // Decided → excluded
      card("C", "proposed", { consulted: ["Someone Else"] }), // not the author → excluded
    ];
    expect(filterAttentionCards(cards, "Marta").map((c) => c.id)).toEqual(["A"]);
  });

  it("matches the author across all three people roles (Req 5.1)", () => {
    const cards = [
      card("A", "proposed", { decisionMakers: ["Marta"] }),
      card("B", "proposed", { consulted: ["Marta"] }),
      card("C", "proposed", { informed: ["Marta"] }),
    ];
    expect(filterAttentionCards(cards, "Marta").map((c) => c.id)).toEqual(["A", "B", "C"]);
  });

  it("matches case-insensitively and ignores surrounding whitespace (Req 5.1)", () => {
    const cards = [
      card("A", "proposed", { decisionMakers: ["Marta"] }),
      card("B", "proposed", { consulted: [" marta "] }),
      card("C", "proposed", { informed: ["MARTA"] }),
    ];
    // Author name typed with different case/whitespace still matches every card.
    expect(filterAttentionCards(cards, "  mArTa  ").map((c) => c.id)).toEqual(["A", "B", "C"]);
  });

  it("matches nothing when the author name is blank or whitespace-only (Req 5.2)", () => {
    const cards = [card("A", "proposed", { decisionMakers: ["Marta"] })];
    expect(filterAttentionCards(cards, "")).toEqual([]);
    expect(filterAttentionCards(cards, "   ")).toEqual([]);
  });
});

describe("AttentionDigest (real backend)", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "attention-digest-"));
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
    // The digest reads authorName from the shared portal store singleton; reset
    // it before each test so cases isolate (task 4.1 note: tests set via setState).
    usePortalStore.setState({ authorName: "" });
  });

  afterEach(async () => {
    cleanup();
    usePortalStore.setState({ authorName: "" });
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * Save an ADR through the update path so its status and people fields are
   * persisted and surface on the feed card the digest projects over.
   */
  async function seedAdr(opts: {
    title: string;
    status?: AdrStatus;
    decisionMakers?: string[];
    consulted?: string[];
    informed?: string[];
  }): Promise<{ id: string }> {
    const created = await client.createAdr({ title: opts.title, folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const status = opts.status ?? "proposed";
    const saved = await client.updateAdr(created.adr.id, {
      title: opts.title,
      status,
      date: created.adr.date,
      decisionMakers: opts.decisionMakers ?? [],
      consulted: opts.consulted ?? [],
      informed: opts.informed ?? [],
      contextAndProblemStatement: "Context and problem statement text.",
      decisionOutcome: status === "accepted" ? "Chosen option: A, because it fits." : "We proceed for now.",
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

  function renderDigest(props?: Partial<React.ComponentProps<typeof AttentionDigest>>) {
    const onOpenDecision = props?.onOpenDecision ?? vi.fn();
    render(
      <AttentionDigest apiClient={client} onOpenDecision={onOpenDecision} now={NOW} {...props} />,
      { wrapper: createQueryWrapper() }
    );
    return { onOpenDecision };
  }

  it("lists In-discussion decisions matching the author, case/whitespace-insensitively (Req 5.1)", async () => {
    await seedAdr({ title: "Owned by Marta", decisionMakers: ["Marta"] });
    await seedAdr({ title: "Marta consulted", consulted: [" MARTA "] });
    await seedAdr({ title: "Not Marta at all", decisionMakers: ["Someone Else"] });

    // Author name typed with different case/whitespace than the stored spelling.
    usePortalStore.setState({ authorName: "  marta " });
    renderDigest();

    await waitFor(() => expect(screen.getByText("Owned by Marta")).toBeInTheDocument());
    // The consulted-on decision matches by normalized name too.
    expect(screen.getByText("Marta consulted")).toBeInTheDocument();
    // A decision that does not name the author is excluded.
    expect(screen.queryByText("Not Marta at all")).not.toBeInTheDocument();
  });

  it("excludes decisions that are not In discussion even when the author is named (Req 5.1)", async () => {
    await seedAdr({ title: "Still discussing", decisionMakers: ["Marta"] });
    await seedAdr({ title: "Already decided", status: "accepted", decisionMakers: ["Marta"] });

    usePortalStore.setState({ authorName: "Marta" });
    renderDigest();

    await waitFor(() => expect(screen.getByText("Still discussing")).toBeInTheDocument());
    // The Decided (accepted) decision is not something that needs attention.
    expect(screen.queryByText("Already decided")).not.toBeInTheDocument();
  });

  it("shows a generic prompt state instead of matching while the author name is blank (Req 5.2)", async () => {
    // A decision that WOULD match "Marta" exists. Start with the author set so
    // the personalized list renders (and the feed request settles), then clear
    // the name: the digest must switch to the generic prompt and stop matching.
    await seedAdr({ title: "Owned by Marta", decisionMakers: ["Marta"] });

    usePortalStore.setState({ authorName: "Marta" });
    renderDigest();
    await waitFor(() => expect(screen.getByText("Owned by Marta")).toBeInTheDocument());

    // Clearing the author name drops personalized matching for the prompt (5.2).
    usePortalStore.setState({ authorName: "" });
    await waitFor(() => expect(screen.getByTestId("attention-digest-prompt")).toBeInTheDocument());
    expect(screen.queryByTestId("attention-digest-list")).not.toBeInTheDocument();
    expect(screen.queryByText("Owned by Marta")).not.toBeInTheDocument();
  });

  it("shows an empty state (distinct from the blank-author prompt) when the author has no open decisions", async () => {
    await seedAdr({ title: "Owned by Someone Else", decisionMakers: ["Someone Else"] });

    usePortalStore.setState({ authorName: "Marta" });
    renderDigest();

    await waitFor(() => expect(screen.getByTestId("attention-digest-empty")).toBeInTheDocument());
    // The empty state is not the blank-author prompt.
    expect(screen.queryByTestId("attention-digest-prompt")).not.toBeInTheDocument();
    expect(screen.queryByTestId("attention-digest-list")).not.toBeInTheDocument();
  });

  it("navigates to a decision's article when its digest entry is selected (Req 5.3)", async () => {
    const { id } = await seedAdr({ title: "Owned by Marta", decisionMakers: ["Marta"] });

    usePortalStore.setState({ authorName: "Marta" });
    const onOpenDecision = vi.fn();
    renderDigest({ onOpenDecision });

    await waitFor(() => expect(screen.getByText("Owned by Marta")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Owned by Marta/i }));
    expect(onOpenDecision).toHaveBeenCalledWith(id);
  });
});
