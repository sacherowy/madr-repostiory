import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import Fastify, { type FastifyInstance } from "fastify";
import type { FeedCard } from "@adr/shared";
import { buildContainer, type Container } from "../container.js";
import { buildServer } from "../server.js";
import { feedRoutes } from "./feed.js";
import { adrRoutes } from "./adrs.js";
import { relationRoutes } from "./relations.js";
import { folderRoutes } from "./folders.js";
import { historyRoutes } from "./history.js";
import { compareRoutes } from "./compare.js";
import { searchRoutes } from "./search.js";
import { similarityRoutes } from "./similarity.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-routes-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

/** Raw MADR fixture with real sections so parseAdr yields full records. */
function adrRaw(opts: {
  id: string;
  title: string;
  status?: string;
  date?: string;
  summary?: string;
  decisionMakers?: string[];
  consulted?: string[];
  informed?: string[];
  outcome?: string;
}): string {
  const fm: string[] = [
    `id: ${opts.id}`,
    `status: ${opts.status ?? "proposed"}`,
    `date: "${opts.date ?? "2024-01-01"}"`,
  ];
  if (opts.summary !== undefined) fm.push(`summary: "${opts.summary}"`);
  if (opts.decisionMakers) fm.push(`decision-makers: [${opts.decisionMakers.join(", ")}]`);
  if (opts.consulted) fm.push(`consulted: [${opts.consulted.join(", ")}]`);
  if (opts.informed) fm.push(`informed: [${opts.informed.join(", ")}]`);

  const body: string[] = [
    `# ${opts.title}`,
    "",
    "## Context and Problem Statement",
    `Context for ${opts.id}.`,
  ];
  if (opts.outcome !== undefined) {
    body.push("", "## Decision Outcome", opts.outcome);
  }

  return `---\n${fm.join("\n")}\n---\n${body.join("\n")}\n`;
}

describe("feedRoutes", () => {
  let repoPath: string;
  let container: Container;
  let app: FastifyInstance;

  beforeEach(async () => {
    repoPath = await initRepo();
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    // Seed an initial commit so listAdrFiles/log have a HEAD to scan against.
    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);

    app = Fastify();
    await app.register(feedRoutes, { container });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("GET /api/feed", () => {
    it("returns 200 with enriched FeedCard[] over a seeded repo, sorted by date descending (req 2.3)", async () => {
      await container.git.writeAndCommit(
        "decisions/0001-older.md",
        adrRaw({
          id: "adr-0001",
          title: "Older decision",
          status: "accepted",
          date: "2026-01-01",
          decisionMakers: ["alice"],
          consulted: ["bob"],
          informed: ["carol"],
          outcome: 'Chosen option: "PostgreSQL", because it fits.',
        }),
        "add older",
        AUTHOR
      );
      await container.git.writeAndCommit(
        "decisions/platform/0002-newer.md",
        adrRaw({
          id: "adr-0002",
          title: "Newer decision",
          status: "proposed",
          date: "2026-02-01",
          summary: "One authored sentence.",
        }),
        "add newer",
        AUTHOR
      );

      const res = await app.inject({ method: "GET", url: "/api/feed" });

      expect(res.statusCode).toBe(200);
      const cards = res.json() as FeedCard[];
      expect(cards).toHaveLength(2);

      // Sorted by date descending.
      expect(cards.map((c) => c.id)).toEqual(["adr-0002", "adr-0001"]);

      // The authored-summary card resolves its short description from the
      // frontmatter summary (layer 1).
      expect(cards[0]).toMatchObject({
        id: "adr-0002",
        title: "Newer decision",
        status: "proposed",
        path: "decisions/platform/0002-newer.md",
        topic: "decisions/platform",
        date: "2026-02-01",
        decisionMakers: [],
        consulted: [],
        informed: [],
        shortDescription: { text: "One authored sentence.", source: "summary" },
      });

      // The summary-less card falls back to deterministic derivation (layer 2)
      // and carries its full people fields.
      expect(cards[1]).toMatchObject({
        id: "adr-0001",
        title: "Older decision",
        status: "accepted",
        path: "decisions/0001-older.md",
        topic: "decisions",
        date: "2026-01-01",
        decisionMakers: ["alice"],
        consulted: ["bob"],
        informed: ["carol"],
      });
      expect(cards[1].shortDescription.source).toBe("derived");
      expect(cards[1].shortDescription.text.length).toBeGreaterThan(0);
    });

    it("returns 200 with [] when the repo holds no ADR records", async () => {
      const res = await app.inject({ method: "GET", url: "/api/feed" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });
});

/**
 * 15.3 guard: the three new endpoints are purely additive. Every
 * representative pre-existing endpoint must serve a byte-identical response
 * whether the process registers only the pre-existing route plugins
 * ("before") or the full buildServer wiring including feed/raw/suggestion
 * ("after"), over the same seeded repository.
 */
describe("existing-endpoint byte-compatibility guard (req 15.3)", () => {
  let repoPath: string;
  let container: Container;
  let appBefore: FastifyInstance;
  let appAfter: FastifyInstance;

  beforeEach(async () => {
    repoPath = await initRepo();
    container = buildContainer({
      repoPath,
      sqlitePath: join(repoPath, "test.sqlite"),
      gemini: { model: "fake-model", apiKey: "fake-key" },
    });

    await container.git.writeAndCommit("decisions/.gitkeep", "", "init repo", AUTHOR);

    appBefore = Fastify();
    await appBefore.register(adrRoutes, { container });
    await appBefore.register(relationRoutes, { container });
    await appBefore.register(folderRoutes, { container });
    await appBefore.register(historyRoutes, { container });
    await appBefore.register(compareRoutes, { container });
    await appBefore.register(searchRoutes, { container });
    await appBefore.register(similarityRoutes, { container });
    await appBefore.ready();

    appAfter = await buildServer(container);
  });

  afterEach(async () => {
    await appBefore.close();
    await appAfter.close();
    await rm(repoPath, { recursive: true, force: true });
  });

  it("serves byte-identical GET /api/tree, /api/adrs/:id, and /api/search responses with and without the new routes registered", async () => {
    // Create AND save through the real HTTP surface — the search index is
    // populated on save, so the /api/search leg genuinely exercises a hit.
    const createRes = await appAfter.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "Guarded decision", folder: "decisions", author: AUTHOR },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();

    const saveRes = await appAfter.inject({
      method: "PUT",
      url: `/api/adrs/${created.id}`,
      payload: {
        title: "Guarded decision",
        status: "accepted",
        date: "2026-01-01",
        contextAndProblemStatement: "Guarded body.",
        decisionOutcome: "Guarded outcome.",
        decisionDrivers: "",
        consideredOptions: "",
        consequences: "",
        confirmation: "",
        prosAndConsOfTheOptions: "",
        moreInformation: "",
        additionalContent: "",
        author: AUTHOR,
        baseBlobSha: created.blobSha,
      },
    });
    expect(saveRes.statusCode).toBe(200);

    const endpoints = [
      "/api/tree",
      `/api/adrs/${created.id}`,
      "/api/search?q=Guarded",
    ];

    for (const url of endpoints) {
      const before = await appBefore.inject({ method: "GET", url });
      const after = await appAfter.inject({ method: "GET", url });

      expect(after.statusCode).toBe(before.statusCode);
      // Byte-for-byte identical payloads.
      expect(after.body).toBe(before.body);
    }

    // The search endpoint genuinely exercised a hit, not an empty array.
    const hits = (await appAfter.inject({ method: "GET", url: "/api/search?q=Guarded" })).json();
    expect(hits.length).toBeGreaterThan(0);
  });

  it("keeps GET /api/adrs/:id free of a summary key for an ADR without one, and includes the additive summary field only when the file carries it", async () => {
    const createRes = await appAfter.inject({
      method: "POST",
      url: "/api/adrs",
      payload: { title: "No summary here", folder: "decisions", author: AUTHOR },
    });
    const created = createRes.json();

    const plain = (
      await appAfter.inject({ method: "GET", url: `/api/adrs/${created.id}` })
    ).json();
    expect("summary" in plain).toBe(false);

    await container.git.writeAndCommit(
      "decisions/0042-with-summary.md",
      adrRaw({
        id: "adr-0042",
        title: "With summary",
        summary: "Authored one-liner.",
      }),
      "seed summary adr",
      AUTHOR
    );

    const withSummary = (
      await appAfter.inject({ method: "GET", url: "/api/adrs/adr-0042" })
    ).json();
    expect(withSummary.summary).toBe("Authored one-liner.");
  });
});
