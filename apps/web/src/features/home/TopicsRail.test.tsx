import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as HomePage.test.tsx (see its note): @adr/api is
// reached via its `src/` for test-only use inside the pnpm workspace.
import { buildContainer, type Container } from "../../../../api/src/container.js";
import { buildServer } from "../../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../../api/client.js";
import { createQueryWrapper } from "../../test/queryWrapper.js";
import { TopicsRail } from "./TopicsRail.js";
import { HomePage } from "./HomePage.js";

const AUTHOR = "Test Author <test@example.com>";

describe("TopicsRail (real backend)", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "topics-rail-"));
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

  it("summarizes the available top-level topics as shortcuts (Req 3.3)", async () => {
    await seedAdr("Message bus", "backend");
    await seedAdr("Rate limiting", "backend/api");
    await seedAdr("Design tokens", "frontend");

    render(<TopicsRail apiClient={client} onSelectTopic={vi.fn()} />, {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(screen.getByTestId("rail-topic-backend")).toBeInTheDocument());
    expect(screen.getByTestId("rail-topic-frontend")).toBeInTheDocument();
    // The rail counts a top-level topic's decisions including its sub-topics.
    expect(screen.getByTestId("rail-topic-backend")).toHaveTextContent("2");
  });

  it("links into the Topics destination filtered to the chosen topic (Req 3.3)", async () => {
    await seedAdr("Message bus", "backend");
    const onSelectTopic = vi.fn();

    render(<TopicsRail apiClient={client} onSelectTopic={onSelectTopic} />, {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(screen.getByTestId("rail-topic-backend")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("rail-topic-backend"));
    expect(onSelectTopic).toHaveBeenCalledWith("backend");
  });

  it("mounts into HomePage's topics-rail slot additively (Req 3.3 seam, task 5.2)", async () => {
    await seedAdr("Message bus", "backend");

    // Additive seam: TopicsRail is passed into the existing `topicsRail` slot with
    // a one-line usage — HomePage itself is never edited to accommodate it.
    render(
      <HomePage
        apiClient={client}
        onOpenDecision={vi.fn()}
        topicsRail={<TopicsRail apiClient={client} onSelectTopic={vi.fn()} />}
      />,
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => expect(screen.getByTestId("rail-topic-backend")).toBeInTheDocument());
    expect(screen.getByTestId("home-topics-rail-slot")).toContainElement(
      screen.getByTestId("rail-topic-backend")
    );
  });
});
