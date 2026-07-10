import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import { STATUS_LABELS, type AdrStatus } from "@adr/shared";
// Same relative-path device as SearchPanel.test.tsx / useFeed.test.ts: @adr/api
// has no `exports` field, so it is reached via a relative path into its `src/`
// for test-only use inside the pnpm workspace. HomePage.test.tsx lives one level
// deeper than SearchPanel.test.tsx (features/home vs features/search), so the
// `../` depth is identical.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { HomePage } from "./HomePage.js";

const AUTHOR = "Test Author <test@example.com>";

// Fixed clock so FeedCard relative timestamps stay deterministic across runs.
const NOW = new Date("2026-07-08T12:00:00Z");

describe("HomePage", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "home-page-"));
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
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * Create an ADR and save it through the existing update path so it (a) carries
   * the requested status/body/summary and (b) is present in the keyword search
   * index — the index is only populated on save() (PUT), never on create()
   * (POST), exactly as SearchPanel.test.tsx's own fixture helper documents.
   */
  async function seedAdr(opts: {
    title: string;
    status?: AdrStatus;
    body?: string;
  }): Promise<{ id: string }> {
    const created = await client.createAdr({ title: opts.title, folder: "decisions", author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const saved = await client.updateAdr(created.adr.id, {
      title: opts.title,
      status: opts.status ?? "proposed",
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      contextAndProblemStatement: opts.body ?? "Context and problem statement text.",
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

  function renderHome(props?: Partial<React.ComponentProps<typeof HomePage>>) {
    const onOpenDecision = props?.onOpenDecision ?? vi.fn();
    render(
      <HomePage apiClient={client} onOpenDecision={onOpenDecision} now={NOW} {...props} />,
      { wrapper: createQueryWrapper() }
    );
    return { onOpenDecision };
  }

  it("renders the feed of decision cards from the backend (Req 2.3)", async () => {
    await seedAdr({ title: "Adopt event sourcing" });
    await seedAdr({ title: "Standardize on PostgreSQL" });

    renderHome();

    await waitFor(() => {
      expect(screen.getByText("Adopt event sourcing")).toBeInTheDocument();
    });
    expect(screen.getByText("Standardize on PostgreSQL")).toBeInTheDocument();
    // Rendered inside the shared FeedCard presentation.
    expect(screen.getByTestId("home-feed")).toBeInTheDocument();
  });

  it("presents plain-word filter chips for all five status categories, including Rejected (Req 2.4)", async () => {
    await seedAdr({ title: "Any decision" });
    renderHome();

    await waitFor(() => expect(screen.getByText("Any decision")).toBeInTheDocument());

    const statuses: AdrStatus[] = ["proposed", "accepted", "deprecated", "superseded", "rejected"];
    for (const status of statuses) {
      const chip = screen.getByTestId(`home-chip-${status}`);
      // Plain-word label, never the raw stored enum value.
      expect(chip).toHaveTextContent(STATUS_LABELS[status]);
      expect(chip.textContent).not.toContain(status);
    }
    // Explicitly assert the Rejected chip label is present.
    expect(screen.getByTestId("home-chip-rejected")).toHaveTextContent("Rejected");
  });

  it("narrows the feed to the selected status when a chip is chosen (Req 2.5)", async () => {
    await seedAdr({ title: "Still under debate", status: "proposed" });
    await seedAdr({ title: "Now decided", status: "accepted" });

    renderHome();

    await waitFor(() => expect(screen.getByText("Still under debate")).toBeInTheDocument());
    expect(screen.getByText("Now decided")).toBeInTheDocument();

    // Select the "Decided" chip (accepted) → only the accepted card remains.
    fireEvent.click(screen.getByTestId("home-chip-accepted"));
    await waitFor(() => expect(screen.queryByText("Still under debate")).not.toBeInTheDocument());
    expect(screen.getByText("Now decided")).toBeInTheDocument();
    expect(screen.getByTestId("home-chip-accepted")).toHaveAttribute("aria-pressed", "true");

    // Switch to the "In discussion" chip (proposed) → the other card shows.
    fireEvent.click(screen.getByTestId("home-chip-proposed"));
    await waitFor(() => expect(screen.getByText("Still under debate")).toBeInTheDocument());
    expect(screen.queryByText("Now decided")).not.toBeInTheDocument();

    // Toggling the active chip off restores the full feed.
    fireEvent.click(screen.getByTestId("home-chip-proposed"));
    await waitFor(() => expect(screen.getByText("Now decided")).toBeInTheDocument());
    expect(screen.getByText("Still under debate")).toBeInTheDocument();
  });

  it("submits the hero search to the existing keyword search and renders hits as feed cards (Req 2.2, 14.1, 14.2)", async () => {
    await seedAdr({ title: "Findable decision", body: "This decision discusses zzuniquekeyword extensively." });
    await seedAdr({ title: "Unrelated decision", body: "Nothing relevant here at all." });

    renderHome();

    await waitFor(() => expect(screen.getByText("Findable decision")).toBeInTheDocument());
    expect(screen.getByText("Unrelated decision")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("home-search-input"), { target: { value: "zzuniquekeyword" } });
    fireEvent.submit(screen.getByTestId("home-search-form"));

    // Only the matching decision remains, still rendered as a feed card.
    await waitFor(() => expect(screen.queryByText("Unrelated decision")).not.toBeInTheDocument());
    expect(screen.getByText("Findable decision")).toBeInTheDocument();
    expect(screen.getByTestId("home-feed")).toBeInTheDocument();
  });

  it("navigates to a decision when its card is selected (Req 2.6)", async () => {
    const { id } = await seedAdr({ title: "Openable decision" });
    const onOpenDecision = vi.fn();
    renderHome({ onOpenDecision });

    await waitFor(() => expect(screen.getByText("Openable decision")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Openable decision/i }));
    expect(onOpenDecision).toHaveBeenCalledWith(id);
  });

  it("shows an inviting empty state (not a blank feed) when a filter yields no matches, with a way back (Req 2.7)", async () => {
    await seedAdr({ title: "Only proposed decision", status: "proposed" });
    renderHome();

    await waitFor(() => expect(screen.getByText("Only proposed decision")).toBeInTheDocument());

    // Rejected chip matches nothing → empty state, not a blank feed.
    fireEvent.click(screen.getByTestId("home-chip-rejected"));
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());
    expect(screen.queryByText("Only proposed decision")).not.toBeInTheDocument();
    // The empty state invites a next action rather than dead-ending.
    const empty = screen.getByTestId("home-empty");
    expect(within(empty).getByRole("button")).toBeInTheDocument();

    // Clearing the filter restores the feed.
    fireEvent.click(within(empty).getByRole("button"));
    await waitFor(() => expect(screen.getByText("Only proposed decision")).toBeInTheDocument());
  });

  it("renders the topics-rail and attention-digest mount slots, empty when no content is provided", async () => {
    renderHome();
    // Wait for the feed request to settle (empty feed -> "No decisions yet")
    // before asserting; ending the test while `/api/feed` is still in flight
    // leaves a socket open that stalls the afterEach `app.close()` teardown.
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());
    const railSlot = screen.getByTestId("home-topics-rail-slot");
    const digestSlot = screen.getByTestId("home-attention-digest-slot");
    // Placeholder slots start empty so sibling tasks 5.3/5.5 can fill them additively.
    expect(railSlot).toBeEmptyDOMElement();
    expect(digestSlot).toBeEmptyDOMElement();
  });

  it("mounts provided rail content into the slots (additive seam for tasks 5.3 / 5.5)", async () => {
    renderHome({
      topicsRail: <div data-testid="provided-topics-rail">Topics</div>,
      attentionDigest: <div data-testid="provided-attention-digest">Attention</div>,
    });
    await waitFor(() => expect(screen.getByTestId("provided-topics-rail")).toBeInTheDocument());
    expect(screen.getByTestId("provided-attention-digest")).toBeInTheDocument();
    expect(screen.getByTestId("home-topics-rail-slot")).toContainElement(
      screen.getByTestId("provided-topics-rail")
    );
    expect(screen.getByTestId("home-attention-digest-slot")).toContainElement(
      screen.getByTestId("provided-attention-digest")
    );
    // Let the in-flight feed request settle before teardown (see the empty-slot
    // test above) so afterEach `app.close()` does not stall on an open socket.
    await waitFor(() => expect(screen.getByTestId("home-empty")).toBeInTheDocument());
  });
});
