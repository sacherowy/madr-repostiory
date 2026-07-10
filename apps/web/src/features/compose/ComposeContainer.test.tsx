import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
import type { Adr } from "@adr/shared";
// Same relative-path device as TopicPicker.test.tsx / HomePage.test.tsx: @adr/api
// has no `exports` field, so its `src/` is reached via a relative path for
// test-only use inside the pnpm workspace.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryClient } from "../../state/queryClient.js";
import { useFeed } from "../../hooks/useFeed.js";
import { ComposeContainer } from "./ComposeContainer.js";
import { CONFLICT_COPY } from "./useComposeSave.js";

const AUTHOR = "Test Author <test@example.com>";

/**
 * A tiny feed viewer sharing the container's QueryClient. Because it observes
 * the `["feed"]` query, a save-driven invalidation is directly observable as a
 * re-render that lists the decision — this is how the tests prove that a save
 * refreshes the feed (design "Implementation Notes (web)": saves invalidate
 * `["feed"]` and the per-id keys).
 */
function FeedProbe({ client }: { client: ApiClient }) {
  const feed = useFeed(client);
  return (
    <ul data-testid="feed-probe">
      {(feed.data ?? []).map((card) => (
        <li key={card.id} data-testid={`feed-probe-${card.id}`}>
          {card.title} :: {card.shortDescription.text}
        </li>
      ))}
    </ul>
  );
}

describe("ComposeContainer (task 7.6 / Req 8.5, 11.1, 15.5)", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "compose-save-"));
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
    // The container (TopicPicker getTree on mount, feed/getAdr fetches, and the
    // save round-trip) may still have in-flight sockets; drop them so close()
    // cannot hang (established real-backend teardown rule).
    app.server.closeAllConnections();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  /** Seeds a Decided ADR with a valid outcome + context so its edit-mode save
   * passes the service's full-document validation (title/context/outcome). */
  async function seedAdr(opts: {
    title: string;
    folder: string;
    context: string;
    outcome: string;
    summary?: string;
  }): Promise<Adr> {
    const created = await client.createAdr({ title: opts.title, folder: opts.folder, author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const updated = await client.updateAdr(created.adr.id, {
      title: opts.title,
      status: "accepted",
      date: created.adr.date,
      contextAndProblemStatement: opts.context,
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: opts.outcome,
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      relations: [],
      summary: opts.summary,
      author: AUTHOR,
      baseBlobSha: created.adr.blobSha,
    });
    if (!updated.ok) throw new Error("fixture setup: updateAdr unexpectedly failed");
    return updated.adr;
  }

  function renderWithFeed(node: JSX.Element) {
    const queryClient = createQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        {node}
        <FeedProbe client={client} />
      </QueryClientProvider>
    );
  }

  it("creates a decision through createAdr and invalidates the feed so it appears (8.3, 8.5)", async () => {
    renderWithFeed(<ComposeContainer apiClient={client} authorName={AUTHOR} />);

    // The empty feed finished its first load (probe present, no cards yet).
    await waitFor(() => expect(screen.getByTestId("feed-probe")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("compose-title-input"), {
      target: { value: "Adopt the decision feed portal" },
    });
    fireEvent.change(screen.getByTestId("compose-prompt-input-contextAndProblemStatement"), {
      target: { value: "The IDE-style workspace is too technical for stakeholders." },
    });

    fireEvent.click(screen.getByTestId("compose-publish"));

    // Observable through the real backend: a new ADR now exists in the feed.
    let createdId = "";
    await waitFor(async () => {
      const feed = await client.getFeed();
      expect(feed.ok).toBe(true);
      if (feed.ok) {
        const card = feed.cards.find((c) => c.title === "Adopt the decision feed portal");
        expect(card).toBeDefined();
        createdId = card?.id ?? "";
      }
    });

    // Observable in the UI: the save invalidated ["feed"], so the on-screen feed
    // probe (sharing the client) refetched and now lists the new decision.
    await waitFor(() =>
      expect(screen.getByTestId(`feed-probe-${createdId}`)).toHaveTextContent(
        "Adopt the decision feed portal"
      )
    );
  });

  it("persists the author summary on create (11.1) and shows it as the feed short description", async () => {
    renderWithFeed(<ComposeContainer apiClient={client} authorName={AUTHOR} />);
    await waitFor(() => expect(screen.getByTestId("feed-probe")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("compose-title-input"), {
      target: { value: "Summary-carrying decision" },
    });
    fireEvent.change(screen.getByTestId("compose-prompt-input-contextAndProblemStatement"), {
      target: { value: "Context for the summary test." },
    });
    fireEvent.change(screen.getByTestId("compose-summary-input"), {
      target: { value: "We chose the portal because stakeholders need plain language." },
    });

    fireEvent.click(screen.getByTestId("compose-publish"));

    await waitFor(async () => {
      const feed = await client.getFeed();
      if (!feed.ok) throw new Error("getFeed failed");
      const card = feed.cards.find((c) => c.title === "Summary-carrying decision");
      expect(card?.shortDescription.text).toBe(
        "We chose the portal because stakeholders need plain language."
      );
      expect(card?.shortDescription.source).toBe("summary");
    });
  });

  it("edits an existing decision through updateAdr, persisting an edited summary (8.5, 11.1)", async () => {
    const seeded = await seedAdr({
      title: "Editable decision",
      folder: "decisions",
      context: "Original context.",
      outcome: "Chosen option: Portal, because it is friendlier",
      summary: "Old summary line.",
    });

    renderWithFeed(<ComposeContainer apiClient={client} authorName={AUTHOR} adrId={seeded.id} />);

    // Wait for edit-mode load to seed the form.
    await waitFor(() =>
      expect(screen.getByTestId("compose-title-input")).toHaveValue("Editable decision")
    );
    expect(screen.getByTestId("compose-summary-input")).toHaveValue("Old summary line.");

    fireEvent.change(screen.getByTestId("compose-summary-input"), {
      target: { value: "New author summary." },
    });
    fireEvent.click(screen.getByTestId("compose-publish"));

    // Persisted through the real backend on the same record.
    await waitFor(async () => {
      const reloaded = await client.getAdr(seeded.id);
      if (!reloaded.ok) throw new Error("getAdr failed");
      expect(reloaded.adr.summary).toBe("New author summary.");
      // Full-document save preserved the outcome/context it did not touch.
      expect(reloaded.adr.decisionOutcome).toBe("Chosen option: Portal, because it is friendlier");
      expect(reloaded.adr.contextAndProblemStatement).toBe("Original context.");
    });

    // The feed refetched (invalidation) and now shows the edited summary.
    await waitFor(() =>
      expect(screen.getByTestId(`feed-probe-${seeded.id}`)).toHaveTextContent("New author summary.")
    );
  });

  it("recovers from a 409 stale-write conflict with the preserved message and a reload flow (8.5)", async () => {
    const seeded = await seedAdr({
      title: "Contended decision",
      folder: "decisions",
      context: "Shared context.",
      outcome: "Chosen option: A, because reasons",
      summary: "First summary.",
    });

    renderWithFeed(<ComposeContainer apiClient={client} authorName={AUTHOR} adrId={seeded.id} />);
    await waitFor(() =>
      expect(screen.getByTestId("compose-title-input")).toHaveValue("Contended decision")
    );

    // A competing writer saves first, moving the blob SHA past what the form loaded.
    const competing = await client.updateAdr(seeded.id, {
      title: "Competing title",
      status: "accepted",
      date: seeded.date,
      contextAndProblemStatement: "Shared context.",
      decisionDrivers: "",
      consideredOptions: "",
      decisionOutcome: "Chosen option: A, because reasons",
      consequences: "",
      confirmation: "",
      prosAndConsOfTheOptions: "",
      moreInformation: "",
      additionalContent: "",
      relations: [],
      summary: "Competing summary.",
      author: AUTHOR,
      baseBlobSha: seeded.blobSha,
    });
    if (!competing.ok) throw new Error("fixture setup: competing update failed");

    // Our now-stale save must surface the preserved conflict message verbatim.
    fireEvent.change(screen.getByTestId("compose-summary-input"), {
      target: { value: "My stale summary." },
    });
    fireEvent.click(screen.getByTestId("compose-publish"));

    await waitFor(() =>
      expect(screen.getByTestId("compose-conflict")).toHaveTextContent(CONFLICT_COPY)
    );

    // The recovery flow reloads the latest version into the form and clears the
    // conflict, matching the previous editor's reload-latest behavior.
    fireEvent.click(screen.getByTestId("compose-conflict-reload"));
    await waitFor(() =>
      expect(screen.getByTestId("compose-title-input")).toHaveValue("Competing title")
    );
    expect(screen.queryByTestId("compose-conflict")).not.toBeInTheDocument();
  });

  it("preserves the exact conflict message content unchanged from the previous editor (8.5)", () => {
    // Guards the verbatim string so a wording drift is caught, not silently
    // "recovered" — 8.5 requires the existing user-facing message content.
    expect(CONFLICT_COPY).toBe("Plik zmienił się od ostatniego odczytu. Odśwież i zapisz ponownie.");
  });
});
