import { describe, it, expect } from "vitest";
import type { AdrFile, CommitMeta, DiffResult, GitPort, TreeEntry } from "../ports/git.js";
import { FeedService } from "./feedService.js";

/**
 * In-memory fake GitPort test double: `files` holds raw ADR markdown keyed by
 * path. Zero actual I/O, matching this package's zero-I/O constraint for its
 * own tests (same style as folderService.test.ts / similarityService.test.ts).
 * Only `read` and `listAdrFiles` are exercised by FeedService.
 */
class FakeGitPort implements GitPort {
  constructor(private files: Map<string, string>) {}

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`not found: ${path}`);
    return content;
  }

  async currentBlobSha(): Promise<string | null> {
    throw new Error("not used in this test");
  }

  async writeAndCommit(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }

  async log(): Promise<CommitMeta[]> {
    throw new Error("not used in this test");
  }

  async diff(): Promise<DiffResult> {
    throw new Error("not used in this test");
  }

  async listAdrFiles(branchPath: string): Promise<AdrFile[]> {
    const prefix = branchPath === "" || branchPath === "." ? "" : `${branchPath}/`;
    return Array.from(this.files.keys())
      .filter((p) => p.endsWith(".md") && p.startsWith(prefix))
      .map((path) => ({ path, blobSha: `sha-${path}` }));
  }

  async listTreeEntries(): Promise<TreeEntry[]> {
    throw new Error("not used in this test");
  }

  async move(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }
}

interface RawOpts {
  id: string;
  title: string;
  status?: string;
  /** Emitted verbatim into the frontmatter, so callers control YAML quoting
   * (quoted = string, unquoted `2026-06-17` = YAML timestamp / JS Date). */
  date?: string;
  summary?: string;
  decisionMakers?: string[];
  consulted?: string[];
  informed?: string[];
  relations?: { type: string; target: string }[];
  context?: string;
  drivers?: string[];
  options?: string[];
  outcome?: string;
}

function adrRaw(opts: RawOpts): string {
  const fm: string[] = [
    `id: ${opts.id}`,
    `status: ${opts.status ?? "proposed"}`,
    `date: ${opts.date ?? '"2024-01-01"'}`,
  ];
  if (opts.summary !== undefined) fm.push(`summary: "${opts.summary}"`);
  if (opts.decisionMakers) fm.push(`decision-makers: [${opts.decisionMakers.join(", ")}]`);
  if (opts.consulted) fm.push(`consulted: [${opts.consulted.join(", ")}]`);
  if (opts.informed) fm.push(`informed: [${opts.informed.join(", ")}]`);
  if (opts.relations && opts.relations.length > 0) {
    fm.push("relations:");
    for (const rel of opts.relations) {
      fm.push(`  - type: ${rel.type}`);
      fm.push(`    target: ${rel.target}`);
    }
  }

  const body: string[] = [`# ${opts.title}`];
  body.push("", "## Context and Problem Statement", opts.context ?? `Context for ${opts.id}.`);
  if (opts.drivers && opts.drivers.length > 0) {
    body.push("", "## Decision Drivers", ...opts.drivers.map((d) => `* ${d}`));
  }
  if (opts.options && opts.options.length > 0) {
    body.push("", "## Considered Options", ...opts.options.map((o) => `* ${o}`));
  }
  if (opts.outcome !== undefined) {
    body.push("", "## Decision Outcome", opts.outcome);
  }

  return `---\n${fm.join("\n")}\n---\n${body.join("\n")}\n`;
}

/** Frontmatter that makes gray-matter (js-yaml) throw inside parseAdr:
 * an unterminated flow collection is a hard YAMLException. */
const UNPARSEABLE_RAW = "---\nid: [unclosed\n---\n# Broken record\n";

function service(files: Map<string, string>, root?: string): FeedService {
  return root === undefined
    ? new FeedService(new FakeGitPort(files))
    : new FeedService(new FakeGitPort(files), root);
}

describe("FeedService.buildFeed", () => {
  it("assembles one card per parseable ADR with id, title, status, path, date, and people fields (2.3)", async () => {
    const files = new Map([
      [
        "decisions/0001-first.md",
        adrRaw({
          id: "adr-0001",
          title: "First decision",
          status: "accepted",
          date: '"2024-03-05"',
          decisionMakers: ["Alice"],
          consulted: ["Bob", "Carol"],
          informed: ["Dave"],
          outcome: 'Chosen option: "PostgreSQL", because it fits.',
        }),
      ],
    ]);

    const cards = await service(files).buildFeed();

    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      id: "adr-0001",
      title: "First decision",
      status: "accepted",
      path: "decisions/0001-first.md",
      topic: "decisions",
      date: "2024-03-05",
      decisionMakers: ["Alice"],
      consulted: ["Bob", "Carol"],
      informed: ["Dave"],
      shortDescription: { text: "We chose PostgreSQL — it fits.", source: "derived" },
    });
  });

  it("defaults absent people fields to empty arrays", async () => {
    const files = new Map([
      ["0001-solo.md", adrRaw({ id: "adr-0001", title: "Solo decision" })],
    ]);

    const [card] = await service(files).buildFeed();

    expect(card.decisionMakers).toEqual([]);
    expect(card.consulted).toEqual([]);
    expect(card.informed).toEqual([]);
  });

  it("derives topic from the parent folder path, with '' for repository-root files", async () => {
    const files = new Map([
      ["0001-root.md", adrRaw({ id: "adr-0001", title: "Root decision" })],
      ["decisions/0002-mid.md", adrRaw({ id: "adr-0002", title: "Mid decision" })],
      ["decisions/archive/0003-deep.md", adrRaw({ id: "adr-0003", title: "Deep decision" })],
    ]);

    const cards = await service(files).buildFeed();
    const topicById = new Map(cards.map((c) => [c.id, c.topic]));

    expect(topicById.get("adr-0001")).toBe("");
    expect(topicById.get("adr-0002")).toBe("decisions");
    expect(topicById.get("adr-0003")).toBe("decisions/archive");
  });

  it("sorts cards by date descending, then id ascending on equal dates", async () => {
    const files = new Map([
      ["0001-old.md", adrRaw({ id: "adr-0001", title: "Oldest", date: '"2023-11-30"' })],
      ["0004-tie-b.md", adrRaw({ id: "adr-0004", title: "Tie B", date: '"2024-02-10"' })],
      ["0002-tie-a.md", adrRaw({ id: "adr-0002", title: "Tie A", date: '"2024-02-10"' })],
      ["0003-new.md", adrRaw({ id: "adr-0003", title: "Newest", date: '"2024-06-01"' })],
    ]);

    const cards = await service(files).buildFeed();

    expect(cards.map((c) => c.id)).toEqual(["adr-0003", "adr-0002", "adr-0004", "adr-0001"]);
  });

  describe("per-status short descriptions via the shared derivation", () => {
    it("prefers the author frontmatter summary with source 'summary' (11.2)", async () => {
      const files = new Map([
        [
          "0001-summarized.md",
          adrRaw({
            id: "adr-0001",
            title: "Summarized",
            status: "accepted",
            summary: "Author-written line.",
            outcome: 'Chosen option: "X", because Y.',
          }),
        ],
      ]);

      const [card] = await service(files).buildFeed();

      expect(card.shortDescription).toEqual({ text: "Author-written line.", source: "summary" });
    });

    it("derives the Decided card from the canonical outcome phrasing (12.1)", async () => {
      const files = new Map([
        [
          "0001-decided.md",
          adrRaw({
            id: "adr-0001",
            title: "Decided",
            status: "accepted",
            outcome: 'Chosen option: "Event sourcing", because it preserves history.',
          }),
        ],
      ]);

      const [card] = await service(files).buildFeed();

      expect(card.shortDescription).toEqual({
        text: "We chose Event sourcing — it preserves history.",
        source: "derived",
      });
    });

    it("derives the In-discussion card from considered options plus the first driver (12.2)", async () => {
      const files = new Map([
        [
          "0001-open.md",
          adrRaw({
            id: "adr-0001",
            title: "Open question",
            status: "proposed",
            options: ["REST", "GraphQL", "gRPC"],
            drivers: ["Team familiarity"],
          }),
        ],
      ]);

      const [card] = await service(files).buildFeed();

      expect(card.shortDescription).toEqual({
        text: "Weighing REST against GraphQL (+1 more). Key concern: Team familiarity",
        source: "derived",
      });
    });

    it("derives the Replaced card by resolving the replacement's title repository-wide (12.3)", async () => {
      const files = new Map([
        [
          "decisions/0001-old-way.md",
          adrRaw({
            id: "adr-0001",
            title: "Old way",
            status: "superseded",
            date: '"2024-02-02"',
            relations: [{ type: "superseded-by", target: "adr-0002" }],
            outcome: "We used to do it this way.",
          }),
        ],
        // The replacement lives in a DIFFERENT folder: proves the title
        // resolver spans the whole scanned repository, not one folder.
        [
          "platform/0002-new-way.md",
          adrRaw({ id: "adr-0002", title: "New platform way", status: "accepted", date: '"2024-05-05"' }),
        ],
      ]);

      const cards = await service(files).buildFeed();
      const replaced = cards.find((c) => c.id === "adr-0001");

      expect(replaced?.shortDescription).toEqual({
        text: "Replaced by New platform way on 2024-02-02",
        source: "derived",
      });
    });

    it("falls back to the outcome text, then first context sentence, for Rejected (12.4)", async () => {
      const files = new Map([
        [
          "0001-rejected.md",
          adrRaw({
            id: "adr-0001",
            title: "Rejected idea",
            status: "rejected",
            outcome: "Not pursued after review. More detail follows.",
          }),
        ],
        [
          "0002-rejected-no-outcome.md",
          adrRaw({
            id: "adr-0002",
            title: "Rejected without outcome",
            status: "rejected",
            context: "The first context sentence. And a second one.",
          }),
        ],
      ]);

      const cards = await service(files).buildFeed();
      const byId = new Map(cards.map((c) => [c.id, c.shortDescription]));

      expect(byId.get("adr-0001")).toEqual({ text: "Not pursued after review.", source: "derived" });
      expect(byId.get("adr-0002")).toEqual({ text: "The first context sentence.", source: "derived" });
    });
  });

  it("skips unparseable files while still producing cards for every parseable ADR", async () => {
    const files = new Map([
      ["0001-good.md", adrRaw({ id: "adr-0001", title: "Good", date: '"2024-01-01"' })],
      ["0002-broken.md", UNPARSEABLE_RAW],
      ["0003-also-good.md", adrRaw({ id: "adr-0003", title: "Also good", date: '"2024-02-01"' })],
    ]);

    const cards = await service(files).buildFeed();

    expect(cards.map((c) => c.id)).toEqual(["adr-0003", "adr-0001"]);
  });

  it("normalizes an unquoted YAML frontmatter date (parsed as a Date) to its ISO day string", async () => {
    const files = new Map([
      [
        "0001-unquoted.md",
        adrRaw({
          id: "adr-0001",
          title: "Unquoted date",
          status: "superseded",
          date: "2026-06-17", // unquoted: js-yaml yields a JS Date object
          relations: [{ type: "superseded-by", target: "adr-0002" }],
        }),
      ],
      ["0002-next.md", adrRaw({ id: "adr-0002", title: "Successor", date: '"2026-06-18"' })],
    ]);

    const cards = await service(files).buildFeed();
    const card = cards.find((c) => c.id === "adr-0001");

    expect(card?.date).toBe("2026-06-17");
    // The derivation receives the normalized string, so 12.3 still works.
    expect(card?.shortDescription).toEqual({
      text: "Replaced by Successor on 2026-06-17",
      source: "derived",
    });
  });

  it("scans only files under the constructor-provided root", async () => {
    const files = new Map([
      ["decisions/0001-in.md", adrRaw({ id: "adr-0001", title: "In scope" })],
      ["elsewhere/0002-out.md", adrRaw({ id: "adr-0002", title: "Out of scope" })],
    ]);

    const cards = await service(files, "decisions").buildFeed();

    expect(cards.map((c) => c.id)).toEqual(["adr-0001"]);
  });
});
