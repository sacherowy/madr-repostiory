import { describe, it, expect } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import { ComparisonService } from "./comparisonService.js";

/**
 * In-memory fake GitPort test double, mirroring HistoryService's /
 * FolderService's established fake (files keyed by path, logs keyed by path,
 * canned diff patches keyed by `${from}..${to}@${path}`). Zero actual I/O.
 */
class FakeGitPort implements GitPort {
  public diffCalls: Array<{ from: string; to: string; path?: string }> = [];

  constructor(
    private files: Map<string, string>,
    private logs: Map<string, CommitMeta[]> = new Map(),
    private diffs: Map<string, DiffResult> = new Map()
  ) {}

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

  async log(path: string): Promise<CommitMeta[]> {
    const entries = this.logs.get(path);
    if (entries === undefined) throw new Error(`no log configured for: ${path}`);
    return entries;
  }

  async diff(from: string, to: string, path?: string): Promise<DiffResult> {
    this.diffCalls.push({ from, to, path });
    const key = `${from}..${to}@${path}`;
    const result = this.diffs.get(key);
    if (result === undefined) throw new Error(`no diff configured for: ${key}`);
    return result;
  }

  async listAdrFiles(): Promise<AdrFile[]> {
    return Array.from(this.files.keys())
      .filter((p) => p.endsWith(".md"))
      .map((path) => ({ path, blobSha: `sha-${path}` }));
  }

  async listTreeEntries(): Promise<TreeEntry[]> {
    throw new Error("not used in this test");
  }

  async move(): Promise<CommitMeta> {
    throw new Error("not used in this test");
  }
}

function adrRaw(
  id: string,
  title: string,
  opts: {
    status?: string;
    date?: string;
    decisionMakers?: string[];
    consulted?: string[];
    informed?: string[];
    tags?: string[];
    body?: string;
  } = {}
): string {
  const status = opts.status ?? "proposed";
  const date = opts.date ?? "2024-01-01";
  const yamlList = (key: string, values: string[] | undefined): string =>
    values ? `\n${key}: [${values.map((v) => `"${v}"`).join(", ")}]` : "";
  const decisionMakers = yamlList("decision-makers", opts.decisionMakers);
  const consulted = yamlList("consulted", opts.consulted);
  const informed = yamlList("informed", opts.informed);
  const tags = yamlList("tags", opts.tags);
  const body = opts.body ?? `Body for ${id}.`;
  return `---
id: ${id}
title: ${title}
status: ${status}
date: "${date}"${decisionMakers}${consulted}${informed}${tags}
---
${body}
`;
}

const REALISTIC_PATCH = `diff --git a/decisions/0001-first.md b/decisions/0001-first.md
index 0c2aa38..ef1fb33 100644
--- a/decisions/0001-first.md
+++ b/decisions/0001-first.md
@@ -1,3 +1,4 @@
 line one
-line two
+line TWO changed
 line three
+line four
`;

describe("ComparisonService", () => {
  describe("versionDiff", () => {
    it("produces correct DiffHunk[] from a realistic multi-line patch, with from/to CommitMeta from the resolved ADR's log", async () => {
      const files = new Map([["decisions/0001-first.md", adrRaw("adr-0001", "First")]]);
      const fromMeta: CommitMeta = {
        sha: "sha-1",
        author: "Alice <alice@example.com>",
        date: "2024-01-01",
        message: "initial",
      };
      const toMeta: CommitMeta = {
        sha: "sha-2",
        author: "Bob <bob@example.com>",
        date: "2024-02-01",
        message: "edit",
      };
      const logs = new Map([["decisions/0001-first.md", [toMeta, fromMeta]]]);
      const diffs = new Map([
        ["sha-1..sha-2@decisions/0001-first.md", { from: "sha-1", to: "sha-2", patch: REALISTIC_PATCH }],
      ]);
      const git = new FakeGitPort(files, logs, diffs);
      const svc = new ComparisonService(git);

      const result = await svc.versionDiff("adr-0001", "sha-1", "sha-2");

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("expected ok");
      expect(result.view.from).toEqual(fromMeta);
      expect(result.view.to).toEqual(toMeta);
      expect(result.view.hunks).toEqual([
        { kind: "unchanged", text: "line one" },
        { kind: "removed", text: "line two" },
        { kind: "added", text: "line TWO changed" },
        { kind: "unchanged", text: "line three" },
        { kind: "added", text: "line four" },
      ]);
    });

    it("rejects when `to` is missing", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.versionDiff("adr-0001", "sha-1", "");

      expect(result.kind).toBe("invalid");
    });

    it("rejects when `from` is missing", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.versionDiff("adr-0001", "", "sha-2");

      expect(result.kind).toBe("invalid");
    });

    it("rejects when `to` does not appear in the resolved ADR's own log (e.g. belongs to a different ADR)", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const logs = new Map([
        [
          "0001-first.md",
          [{ sha: "sha-1", author: "Alice", date: "2024-01-01", message: "initial" }],
        ],
      ]);
      const git = new FakeGitPort(files, logs);
      const svc = new ComparisonService(git);

      const result = await svc.versionDiff("adr-0001", "sha-1", "sha-from-other-adr");

      expect(result.kind).toBe("invalid");
    });

    it("rejects when `from` does not appear in the resolved ADR's own log (bogus sha)", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const logs = new Map([
        [
          "0001-first.md",
          [{ sha: "sha-2", author: "Bob", date: "2024-02-01", message: "edit" }],
        ],
      ]);
      const git = new FakeGitPort(files, logs);
      const svc = new ComparisonService(git);

      const result = await svc.versionDiff("adr-0001", "sha-bogus", "sha-2");

      expect(result.kind).toBe("invalid");
    });

    it("returns a graceful invalid result (not a thrown error) for an unknown ADR id", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.versionDiff("adr-9999", "sha-1", "sha-2");

      expect(result.kind).toBe("invalid");
    });
  });

  describe("adrDiff", () => {
    it("produces exactly 8 FieldComparison entries in fixed order, correctly flagging differing vs identical fields", async () => {
      const files = new Map([
        [
          "0001-first.md",
          adrRaw("adr-0001", "First Title", {
            status: "proposed",
            date: "2024-01-01",
            decisionMakers: ["Alice"],
            consulted: ["Carol"],
            informed: ["Eve"],
            tags: ["infra"],
            body: "Body A",
          }),
        ],
        [
          "0002-second.md",
          adrRaw("adr-0002", "Second Title", {
            status: "proposed",
            date: "2024-02-01",
            decisionMakers: ["Bob"],
            consulted: ["Dave"],
            informed: ["Frank"],
            tags: ["infra"],
            body: "Body B",
          }),
        ],
      ]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.adrDiff("adr-0001", "adr-0002");

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("expected ok");
      expect(result.view.fields.map((f) => f.field)).toEqual([
        "title",
        "status",
        "date",
        "decisionMakers",
        "consulted",
        "informed",
        "tags",
        "body",
      ]);
      expect(result.view.fields).toHaveLength(8);

      const byField = Object.fromEntries(result.view.fields.map((f) => [f.field, f]));
      expect(byField.title.differs).toBe(true);
      expect(byField.status.differs).toBe(false);
      expect(byField.date.differs).toBe(true);
      expect(byField.decisionMakers.differs).toBe(true);
      expect(byField.consulted.differs).toBe(true);
      expect(byField.informed.differs).toBe(true);
      expect(byField.tags.differs).toBe(false);
      expect(byField.body.differs).toBe(true);
    });

    it("reflects each ADR's body-derived (H1-fallback) title with no special-casing, via the legacy frontmatter title path", async () => {
      const files = new Map([
        ["0001-first.md", adrRaw("adr-0001", "Legacy Title A")],
        ["0002-second.md", adrRaw("adr-0002", "Legacy Title B")],
      ]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.adrDiff("adr-0001", "adr-0002");

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("expected ok");
      const byField = Object.fromEntries(result.view.fields.map((f) => [f.field, f]));
      expect(byField.title.a).toBe("Legacy Title A");
      expect(byField.title.b).toBe("Legacy Title B");
      expect(byField.title.differs).toBe(true);
    });

    it("rejects when idA === idB", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.adrDiff("adr-0001", "adr-0001");

      expect(result.kind).toBe("invalid");
    });

    it("returns a graceful invalid result (not a thrown error) for an unknown ADR id", async () => {
      const files = new Map([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.adrDiff("adr-0001", "adr-9999");

      expect(result.kind).toBe("invalid");
    });

    it("treats undefined decisionMakers/consulted/informed/tags as equal to an empty array (both stringify to \"\")", async () => {
      const files = new Map([
        [
          "0001-first.md",
          adrRaw("adr-0001", "Same Title", {
            decisionMakers: undefined,
            consulted: undefined,
            informed: undefined,
            tags: undefined,
          }),
        ],
        [
          "0002-second.md",
          adrRaw("adr-0002", "Same Title", { decisionMakers: [], consulted: [], informed: [], tags: [] }),
        ],
      ]);
      const git = new FakeGitPort(files);
      const svc = new ComparisonService(git);

      const result = await svc.adrDiff("adr-0001", "adr-0002");

      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("expected ok");
      const byField = Object.fromEntries(result.view.fields.map((f) => [f.field, f]));
      expect(byField.decisionMakers.a).toBe("");
      expect(byField.decisionMakers.b).toBe("");
      expect(byField.decisionMakers.differs).toBe(false);
      expect(byField.consulted.a).toBe("");
      expect(byField.consulted.b).toBe("");
      expect(byField.consulted.differs).toBe(false);
      expect(byField.informed.a).toBe("");
      expect(byField.informed.b).toBe("");
      expect(byField.informed.differs).toBe(false);
      expect(byField.tags.a).toBe("");
      expect(byField.tags.b).toBe("");
      expect(byField.tags.differs).toBe(false);
    });
  });
});
