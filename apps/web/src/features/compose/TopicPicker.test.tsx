import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as HomePage.test.tsx / ArticlePage.test.tsx: @adr/api
// has no `exports` field, so its `src/` is reached via a relative path for
// test-only use inside the pnpm workspace. TopicPicker.test.tsx sits at the same
// depth as ComposePage (features/compose).
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { TopicPicker } from "./TopicPicker.js";

const AUTHOR = "Test Author <test@example.com>";

/**
 * TopicPicker tests (task 7.2 / Req 8.4, design.md ComposePage bullet). This is
 * the one editor that talks to the real backend: it wraps getTree (listing),
 * createFolder (creation), and moveAdr (move-on-edit). Teardown follows the
 * established real-backend rule — the tests await a settled marker, then
 * afterEach runs cleanup() + closeAllConnections() + app.close() so no in-flight
 * getTree/moveAdr socket stalls the close.
 */
describe("TopicPicker", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "topic-picker-"));
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
    // TopicPicker fetches getTree on mount and may still be reloading after a
    // create/move; drop any open sockets so app.close() cannot hang on one.
    app.server.closeAllConnections();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  async function makeFolder(path: string) {
    const res = await client.createFolder({ path, author: AUTHOR });
    if (!res.ok) throw new Error(`fixture setup: createFolder ${path} unexpectedly failed`);
  }

  it("lists existing folders as topics and reports the chosen topic in create mode (Req 8.4)", async () => {
    await makeFolder("decisions/alpha");
    await makeFolder("decisions/beta");

    const onChange = vi.fn();
    render(<TopicPicker apiClient={client} authorName={AUTHOR} value="" onChange={onChange} />);

    // Settled marker: the tree finished loading and its topic options rendered.
    await waitFor(() =>
      expect(screen.getByTestId("compose-topic-option-decisions/alpha")).toBeInTheDocument()
    );
    expect(screen.getByTestId("compose-topic-option-decisions/beta")).toBeInTheDocument();

    // Create mode: choosing a topic just reports the path — it does not move.
    fireEvent.click(screen.getByTestId("compose-topic-option-decisions/beta"));
    expect(onChange).toHaveBeenCalledWith("decisions/beta");
  });

  it("creates a new topic through createFolder and selects it (Req 8.4)", async () => {
    const onChange = vi.fn();
    render(<TopicPicker apiClient={client} authorName={AUTHOR} value="" onChange={onChange} />);

    await waitFor(() =>
      expect(screen.getByTestId("compose-topic-option-decisions")).toBeInTheDocument()
    );

    fireEvent.change(screen.getByTestId("compose-new-topic-input"), {
      target: { value: "decisions/gamma" },
    });
    fireEvent.click(screen.getByTestId("compose-new-topic-create"));

    // The freshly created folder appears in the topic list...
    await waitFor(() =>
      expect(screen.getByTestId("compose-topic-option-decisions/gamma")).toBeInTheDocument()
    );
    // ...and is reported as the chosen topic.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("decisions/gamma"));
  });

  it("moves the decision to the chosen topic in edit mode (Req 8.4, move-on-edit)", async () => {
    await makeFolder("decisions/alpha");
    await makeFolder("decisions/beta");
    const created = await client.createAdr({
      title: "Movable decision",
      folder: "decisions/alpha",
      author: AUTHOR,
    });
    if (!created.ok) throw new Error("fixture setup: createAdr unexpectedly failed");
    const id = created.adr.id;

    const onChange = vi.fn();
    render(
      <TopicPicker
        apiClient={client}
        authorName={AUTHOR}
        adrId={id}
        value="decisions/alpha"
        onChange={onChange}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("compose-topic-option-decisions/beta")).toBeInTheDocument()
    );
    // The current topic starts selected.
    expect(screen.getByTestId("compose-topic-option-decisions/alpha")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // Changing the topic in edit mode MOVES the stored record.
    fireEvent.click(screen.getByTestId("compose-topic-option-decisions/beta"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("decisions/beta"));

    // Observable through the real backend: the ADR now lives under the new topic.
    const reloaded = await client.getAdr(id);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.adr.path.startsWith("decisions/beta/")).toBe(true);
    }

    // Settled marker: let the post-move tree reload finish re-rendering (its
    // topic options are back in the DOM) before the test ends, so no in-flight
    // getTree state update lands after teardown.
    await waitFor(() =>
      expect(screen.getByTestId("compose-topic-option-decisions/beta")).toBeInTheDocument()
    );
  });

  it("labels the repository root as a plain-language 'General' topic", async () => {
    render(<TopicPicker apiClient={client} authorName={AUTHOR} value="" onChange={vi.fn()} />);

    const root = await screen.findByTestId("compose-topic-option-.");
    expect(within(root).getByText("General")).toBeInTheDocument();
  });
});
