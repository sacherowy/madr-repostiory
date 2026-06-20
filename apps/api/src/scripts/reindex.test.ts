import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import type { Adr } from "@adr/shared";
import { serializeAdr } from "@adr/core";
import { SimpleGitAdapter } from "../infrastructure/git/simpleGitAdapter.js";
import { SqliteEmbeddingStore } from "../infrastructure/persistence/sqlite.js";
import { SqliteSearchIndex } from "../infrastructure/persistence/sqliteSearchIndex.js";
import { main } from "./reindex.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-reindex-"));
  const rawGit = simpleGit(dir);
  await rawGit.init();
  await rawGit.addConfig("user.name", "Test Author");
  await rawGit.addConfig("user.email", "test@example.com");

  // Seed an initial commit so listAdrFiles/log have a HEAD to scan against.
  const git = new SimpleGitAdapter(dir);
  await git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);
  return dir;
}

function fixture(overrides: Partial<Adr> = {}): Adr {
  return {
    id: "adr-0001",
    title: "Use Postgres",
    status: "accepted",
    date: "2026-01-01",
    body: "We decided to use Postgres for persistence.",
    path: "decisions/adr-0001.md",
    blobSha: "",
    ...overrides,
  };
}

describe("reindex main()", () => {
  let repoPath: string;
  let sqlitePath: string;
  let git: SimpleGitAdapter;
  let cfg: { repoPath: string; sqlitePath: string; gemini: { model: string; apiKey: string } };

  beforeEach(async () => {
    repoPath = await initRepo();
    sqlitePath = join(repoPath, "test.sqlite");
    git = new SimpleGitAdapter(repoPath);
    cfg = {
      repoPath,
      sqlitePath,
      gemini: { model: "fake-model", apiKey: "fake-key" },
    };
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  /**
   * Commits a fully-formed ADR file and pre-seeds its post-commit blob sha
   * into a real SqliteEmbeddingStore (mirrors similarity.test.ts's
   * `seedVector` pattern) so the embedding step's cache check always hits
   * and `GeminiEmbeddingProvider.embed` (real network I/O against fake
   * creds) is never reached in these tests.
   */
  async function commitAdr(adr: Adr): Promise<Adr> {
    await git.writeAndCommit(adr.path, serializeAdr(adr), `save ${adr.id}`, AUTHOR);
    const blobSha = (await git.currentBlobSha(adr.path)) as string;
    const store = new SqliteEmbeddingStore(sqlitePath);
    store.set(blobSha, [0, 0, 0]);
    return { ...adr, blobSha };
  }

  it("indexes current ADRs so each is findable by a term from its title/body", async () => {
    await commitAdr(
      fixture({
        id: "adr-0001",
        title: "Use Postgres",
        body: "We decided to use Postgres for persistence.",
        path: "decisions/adr-0001.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0002",
        title: "Adopt kubernetes",
        body: "We will run all services on a managed cluster.",
        path: "decisions/adr-0002.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0003",
        title: "Choose a frontend framework",
        body: "We evaluated React, Vue and Svelte for the frontend.",
        path: "decisions/adr-0003.md",
      })
    );

    await main(cfg);

    const searchIndex = new SqliteSearchIndex(sqlitePath);
    expect(searchIndex.search("Postgres").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("kubernetes").map((h) => h.id)).toContain("adr-0002");
    expect(searchIndex.search("Svelte").map((h) => h.id)).toContain("adr-0003");
  });

  it("running main() twice against an unchanged repo produces no duplicate entries", async () => {
    await commitAdr(
      fixture({
        id: "adr-0001",
        title: "Use Postgres",
        body: "We decided to use Postgres for persistence.",
        path: "decisions/adr-0001.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0002",
        title: "Adopt kubernetes",
        body: "We will run all services on a managed cluster.",
        path: "decisions/adr-0002.md",
      })
    );

    await main(cfg);
    await main(cfg);

    const searchIndex = new SqliteSearchIndex(sqlitePath);
    const postgresHits = searchIndex.search("Postgres").filter((h) => h.id === "adr-0001");
    expect(postgresHits).toHaveLength(1);

    const kubernetesHits = searchIndex.search("kubernetes").filter((h) => h.id === "adr-0002");
    expect(kubernetesHits).toHaveLength(1);

    expect(searchIndex.ids().sort()).toEqual(["adr-0001", "adr-0002"]);
  });

  it("prunes a stale id from the search index once its ADR file disappears from the repo", async () => {
    await commitAdr(
      fixture({
        id: "adr-0001",
        title: "Use Postgres",
        body: "We decided to use Postgres for persistence, mentioning zzunique-marker.",
        path: "decisions/adr-0001.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0002",
        title: "Adopt kubernetes",
        body: "We will run all services on a managed cluster.",
        path: "decisions/adr-0002.md",
      })
    );

    await main(cfg);

    let searchIndex = new SqliteSearchIndex(sqlitePath);
    expect(searchIndex.ids()).toContain("adr-0001");

    // Delete adr-0001's file via a real git commit so it disappears from
    // listAdrFiles(".").
    const rawGit = simpleGit(repoPath);
    await rawGit.rm(["decisions/adr-0001.md"]);
    await rawGit.commit("delete adr-0001", undefined, { "--author": AUTHOR });

    await main(cfg);

    searchIndex = new SqliteSearchIndex(sqlitePath);
    expect(searchIndex.ids()).not.toContain("adr-0001");
    expect(searchIndex.ids()).toContain("adr-0002");
    expect(
      searchIndex.search("zzunique-marker").map((h) => h.id)
    ).not.toContain("adr-0001");
  });

  it("completes without throwing when every blob sha is pre-seeded (embedding cache-hit path, no network call attempted)", async () => {
    await commitAdr(
      fixture({
        id: "adr-0001",
        title: "Use Postgres",
        body: "We decided to use Postgres for persistence.",
        path: "decisions/adr-0001.md",
      })
    );

    await expect(main(cfg)).resolves.not.toThrow();
  });
});
