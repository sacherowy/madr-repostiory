import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as SearchPanel.test.tsx (task 5.6): @adr/api has
// no exports field, so it's reached via a relative path into its src/ rather
// than a bare specifier. SimilarityPanel.test.tsx is a sibling of
// SearchPanel.test.tsx, HistoryTimeline.test.tsx, RelationsPanel.test.tsx,
// FolderTree.test.tsx, and AdrEditor.test.tsx, so the `../` depth matches.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { SimilarityPanel } from "./SimilarityPanel.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "similarity-panel-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("SimilarityPanel", () => {
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

  /**
   * `container`'s `GeminiEmbeddingProvider` is wired with fake creds and would
   * attempt a real network call to the Gemini API on any genuine cache miss.
   * Pre-seeding every fixture's blob sha into the real `SqliteEmbeddingStore`
   * here (the exact cache-hit path `SimilarityService.vectorFor` already
   * checks first) means `findSimilar` never reaches `provider.embed` in these
   * tests — deterministic vectors, zero network I/O. Mirrors
   * `apps/api/src/routes/similarity.test.ts`'s own `seedVector` helper.
   */
  function seedVector(blobSha: string, vector: number[]): void {
    container.embeddingStore.set(blobSha, vector);
  }

  async function createAdrWithBody(
    title: string,
    folder: string,
    body: string
  ): Promise<{ id: string; blobSha: string }> {
    const created = await client.createAdr({ title, folder, author: AUTHOR });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const saved = await client.updateAdr(created.adr.id, {
      title,
      status: created.adr.status,
      date: created.adr.date,
      decisionMakers: created.adr.decisionMakers,
      tags: created.adr.tags,
      contextAndProblemStatement: body,
      decisionOutcome: "Proceed.",
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
    return { id: saved.adr.id, blobSha: saved.adr.blobSha };
  }

  it("shows a loading state before resolution", async () => {
    const target = await createAdrWithBody("Loading target", "decisions", "Loading target body.");
    seedVector(target.blobSha, [1, 0, 0]);

    render(<SimilarityPanel apiClient={client} adrId={target.id} folder="decisions" />);

    expect(screen.getByTestId("similarity-loading")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("similarity-empty")).toBeInTheDocument());
  });

  it("renders a ranked list scoped to the explicitly-selected folder, with a real sibling's id and score (req 10.1, 10.2)", async () => {
    const target = await createAdrWithBody("Explicit scope target", "decisions", "Target body about widgets.");
    seedVector(target.blobSha, [1, 0, 0]);

    const sibling = await createAdrWithBody("Explicit scope sibling", "decisions", "Sibling body about widgets too.");
    seedVector(sibling.blobSha, [0.9, 0.1, 0]);

    render(<SimilarityPanel apiClient={client} adrId={target.id} folder="decisions" />);

    await waitFor(() => expect(screen.getByTestId("similarity-results")).toBeInTheDocument());
    const result = screen.getByTestId(`similarity-result-${sibling.id}`);
    expect(result).toBeInTheDocument();
    expect(result).toHaveTextContent(sibling.id);

    const direct = await client.getSimilar(target.id, "decisions");
    if (!direct.ok || direct.kind !== "ranked") throw new Error("fixture setup: direct getSimilar unexpectedly failed");
    // The score now renders through the SimilarityMeter primitive, which
    // formats the value to two decimals (`.meter__value`, e.g. `0.99`) rather
    // than the raw full-precision number the old plain-text render emitted.
    // The behavioral intent — that the rendered result carries the score the
    // backend returned for this sibling — is preserved by asserting on that
    // same two-decimal formatting derived from the direct backend call.
    expect(result).toHaveTextContent(direct.results[0].score.toFixed(2));
  });

  it("falls back to the open ADR's own containing folder when folder prop is null, still finding a sibling in that subfolder but excluding a parent-folder decoy (req 10.1)", async () => {
    const target = await createAdrWithBody("Fallback target", "decisions/sub", "Fallback target body.");
    seedVector(target.blobSha, [1, 0, 0]);

    const sibling = await createAdrWithBody("Fallback sibling", "decisions/sub", "Fallback sibling body.");
    seedVector(sibling.blobSha, [0.85, 0.15, 0]);

    // Lives directly in the parent folder "decisions", not in "decisions/sub"
    // where target/sibling are. Deliberately left unseeded: if the fallback
    // derivation ever widened the scope to the parent (e.g. an indexOf/
    // lastIndexOf mix-up), this ADR would be pulled into scope too, and its
    // absence from the rendered results is what actually proves the scope
    // was narrowed to "decisions/sub" rather than the broader "decisions" —
    // the prior version of this test only checked the sibling was *included*,
    // which a too-wide scope would have passed as well.
    const decoy = await createAdrWithBody("Fallback parent decoy", "decisions", "Decoy body, wrong scope.");

    render(<SimilarityPanel apiClient={client} adrId={target.id} folder={null} />);

    await waitFor(() => expect(screen.getByTestId("similarity-results")).toBeInTheDocument());
    expect(screen.getByTestId(`similarity-result-${sibling.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`similarity-result-${decoy.id}`)).not.toBeInTheDocument();
  });

  it("shows the empty-scope message, distinguishable from loading/error/ranked, when the ADR is alone in its scope (req 10.3)", async () => {
    const alone = await createAdrWithBody("Alone ADR", "decisions/solo", "Alone body.");
    seedVector(alone.blobSha, [1, 0, 0]);

    render(<SimilarityPanel apiClient={client} adrId={alone.id} folder="decisions/solo" />);

    await waitFor(() => expect(screen.getByTestId("similarity-empty")).toBeInTheDocument());
    expect(screen.queryByTestId("similarity-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("similarity-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("similarity-results")).not.toBeInTheDocument();
  });

  it("renders results in the same ranked order the backend returns from a direct client.getSimilar call, never re-sorted client-side", async () => {
    const target = await createAdrWithBody("Ranking order target", "decisions", "Target about quasar subsystems.");
    seedVector(target.blobSha, [1, 0, 0]);

    const closeMatch = await createAdrWithBody("Close match", "decisions", "Close match body.");
    seedVector(closeMatch.blobSha, [0.95, 0.05, 0]);

    const farMatch = await createAdrWithBody("Far match", "decisions", "Far match body.");
    seedVector(farMatch.blobSha, [0, 1, 0]);

    render(<SimilarityPanel apiClient={client} adrId={target.id} folder="decisions" />);

    await waitFor(() => expect(screen.getByTestId("similarity-results")).toBeInTheDocument());

    // Cross-check the rendered order against a direct API call, mirroring
    // SearchPanel.test.tsx's own ordering-verification style: never hardcode
    // an assumed order, always confirm it against the real backend response.
    const direct = await client.getSimilar(target.id, "decisions");
    if (!direct.ok || direct.kind !== "ranked") throw new Error("fixture setup: direct getSimilar unexpectedly failed");
    expect(direct.results.length).toBe(2);

    const renderedIds = screen
      .getAllByTestId(/^similarity-result-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(renderedIds).toEqual(direct.results.map((result) => `similarity-result-${result.adr.id}`));
  });

  it("shows an error state when the similarity request throws (network-level failure)", async () => {
    const target = await createAdrWithBody("Error case target", "decisions", "Error case body.");
    seedVector(target.blobSha, [1, 0, 0]);

    const throwingClient: ApiClient = {
      ...client,
      getSimilar: vi.fn().mockRejectedValue(new Error("network down")),
    };

    render(<SimilarityPanel apiClient={throwingClient} adrId={target.id} folder="decisions" />);

    await waitFor(() => expect(screen.getByTestId("similarity-error")).toBeInTheDocument());
    expect(screen.queryByTestId("similarity-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("similarity-empty")).not.toBeInTheDocument();
  });

  it("shows an error state when the getAdr fallback lookup itself fails (folder prop null, no scope to resolve)", async () => {
    const throwingClient: ApiClient = {
      ...client,
      getAdr: vi.fn().mockRejectedValue(new Error("network down")),
    };

    render(<SimilarityPanel apiClient={throwingClient} adrId="adr-nonexistent" folder={null} />);

    await waitFor(() => expect(screen.getByTestId("similarity-error")).toBeInTheDocument());
  });

  it("returns to the error state for a nonexistent ADR id (real 404 from the backend)", async () => {
    render(<SimilarityPanel apiClient={client} adrId="adr-9999" folder="decisions" />);

    await waitFor(() => expect(screen.getByTestId("similarity-error")).toBeInTheDocument());
  });
});
