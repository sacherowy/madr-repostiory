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
    contextAndProblemStatement: "We decided to use Postgres for persistence.",
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome: "",
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
    additionalContent: "",
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
        contextAndProblemStatement: "We decided to use Postgres for persistence.",
        path: "decisions/adr-0001.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0002",
        title: "Adopt kubernetes",
        contextAndProblemStatement: "We will run all services on a managed cluster.",
        path: "decisions/adr-0002.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0003",
        title: "Choose a frontend framework",
        contextAndProblemStatement: "We evaluated React, Vue and Svelte for the frontend.",
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
        contextAndProblemStatement: "We decided to use Postgres for persistence.",
        path: "decisions/adr-0001.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0002",
        title: "Adopt kubernetes",
        contextAndProblemStatement: "We will run all services on a managed cluster.",
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
        contextAndProblemStatement: "We decided to use Postgres for persistence, mentioning zzunique-marker.",
        path: "decisions/adr-0001.md",
      })
    );
    await commitAdr(
      fixture({
        id: "adr-0002",
        title: "Adopt kubernetes",
        contextAndProblemStatement: "We will run all services on a managed cluster.",
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

  /**
   * Commits raw markdown content verbatim (bypassing serializeAdr, which can
   * only ever emit the canonical new-style frontmatter) so legacy-style
   * fixtures can be exercised, and pre-seeds the resulting blob sha exactly
   * like commitAdr does.
   */
  async function commitRaw(path: string, raw: string): Promise<string> {
    await git.writeAndCommit(path, raw, `seed ${path}`, AUTHOR);
    const blobSha = (await git.currentBlobSha(path)) as string;
    const store = new SqliteEmbeddingStore(sqlitePath);
    store.set(blobSha, [0, 0, 0]);
    return blobSha;
  }

  it("produces correct title and tags in the index for both a migrated-style fixture (decision-makers key, body H1 title) and a legacy-style fixture (deciders key, frontmatter title)", async () => {
    const migratedStyle = [
      "---",
      "id: adr-migrated",
      "status: accepted",
      "date: 2026-01-01",
      "decision-makers: [alice]",
      "tags: [zzznewstyletag]",
      "---",
      "",
      "# New Style Title Zzzmarker",
      "",
      "## Context and Problem Statement",
      "Some migrated-style body content.",
      "",
    ].join("\n");

    const legacyStyle = [
      "---",
      "id: adr-legacy",
      "status: accepted",
      "date: 2026-01-01",
      "deciders: [bob]",
      "title: Legacy Style Title Zzzmarker",
      "tags: [zzzlegacytag]",
      "---",
      "Some legacy-style body content with no heading.",
      "",
    ].join("\n");

    await commitRaw("decisions/migrated.md", migratedStyle);
    await commitRaw("decisions/legacy.md", legacyStyle);

    await main(cfg);

    const searchIndex = new SqliteSearchIndex(sqlitePath);

    // Both titles resolve correctly (body H1 for the migrated style, legacy
    // frontmatter title for the legacy style) and are indexed identically.
    expect(searchIndex.search("Zzzmarker").map((h) => h.id).sort()).toEqual([
      "adr-legacy",
      "adr-migrated",
    ]);

    // tags are indexed per-ADR with no cross-contamination between styles.
    expect(searchIndex.search("zzznewstyletag").map((h) => h.id)).toEqual(["adr-migrated"]);
    expect(searchIndex.search("zzzlegacytag").map((h) => h.id)).toEqual(["adr-legacy"]);
  });

  it("indexes content spread across multiple MADR section fields, not just contextAndProblemStatement (Req 3.11, 6.3)", async () => {
    await commitAdr(
      fixture({
        id: "adr-0001",
        title: "Use Postgres",
        contextAndProblemStatement: "Marker contextzzzalpha needs a persistence decision.",
        decisionDrivers: "Marker driverzzzbeta requires high availability.",
        consideredOptions: "Marker optionzzzgamma considered Postgres and MySQL.",
        decisionOutcome: "Marker outcomezzzdelta chosen: Postgres.",
        consequences: "Marker consequencezzzepsilon: operational overhead.",
        confirmation: "Marker confirmationzzzzeta via load testing.",
        prosAndConsOfTheOptions: "Marker proszzzeta has strong tooling.",
        moreInformation: "Marker morezzztheta links to the proposal doc.",
        additionalContent: "Marker additionalzzziota leftover legacy notes.",
        path: "decisions/adr-0001.md",
      })
    );

    await main(cfg);

    const searchIndex = new SqliteSearchIndex(sqlitePath);
    // Every one of the 8 section fields plus additionalContent must be
    // searchable -- proving the index/embedding text is built from the
    // combined section content, not a single body field.
    expect(searchIndex.search("contextzzzalpha").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("driverzzzbeta").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("optionzzzgamma").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("outcomezzzdelta").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("consequencezzzepsilon").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("confirmationzzzzeta").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("proszzzeta").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("morezzztheta").map((h) => h.id)).toContain("adr-0001");
    expect(searchIndex.search("additionalzzziota").map((h) => h.id)).toContain("adr-0001");
  });

  it("completes without throwing when every blob sha is pre-seeded (embedding cache-hit path, no network call attempted)", async () => {
    await commitAdr(
      fixture({
        id: "adr-0001",
        title: "Use Postgres",
        contextAndProblemStatement: "We decided to use Postgres for persistence.",
        path: "decisions/adr-0001.md",
      })
    );

    await expect(main(cfg)).resolves.not.toThrow();
  });
});
