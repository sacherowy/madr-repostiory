import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { FastifyInstance } from "fastify";
// Same relative-path device as ArticlePage.test.tsx: @adr/api has no `exports`
// field, so it is reached via a relative path into its `src/` for test-only use
// inside the pnpm workspace.
import { buildContainer, type Container } from "../../../api/src/container.js";
import { buildServer } from "../../../api/src/server.js";
import { createApiClient, type ApiClient } from "../api/client.js";
import { createQueryWrapper } from "../test/queryWrapper.js";
import { useRawAdr } from "./useRawAdr.js";

const AUTHOR = "Test Author <test@example.com>";

const RAW_MARKDOWN = [
  "---",
  "id: raw-hook-1",
  "status: proposed",
  'date: "2026-01-01"',
  "---",
  "# Raw Hook Fixture",
  "",
  "## Context and Problem Statement",
  "Spacing   preserved    verbatim.",
  "",
].join("\n");

describe("useRawAdr", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;
  let baseUrl: string;
  let client: ApiClient;

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), "use-raw-adr-"));
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig("user.name", "Test Author");
    await git.addConfig("user.email", "test@example.com");
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "" },
    });
    await container.git.writeAndCommit("decisions/raw-hook-1.md", RAW_MARKDOWN, "seed raw adr", AUTHOR);
    app = await buildServer(container);
    baseUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    client = createApiClient(baseUrl);
  });

  afterEach(async () => {
    app.server.closeAllConnections();
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("fetches the raw content keyed by ['raw', id] and exposes the exact stored bytes + path", async () => {
    const { result } = renderHook(() => useRawAdr(client, "raw-hook-1"), {
      wrapper: createQueryWrapper(),
    });

    // Starts pending, then resolves with the raw file's exact bytes and path.
    expect(result.current.isPending).toBe(true);
    await waitFor(() => expect(result.current.isPending).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual({
      path: "decisions/raw-hook-1.md",
      markdown: RAW_MARKDOWN,
    });
  });

  it("reports an error state when the decision does not exist (non-ok envelope)", async () => {
    const { result } = renderHook(() => useRawAdr(client, "does-not-exist"), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
