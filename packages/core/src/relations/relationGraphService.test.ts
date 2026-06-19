import { describe, it, expect } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import { RelationGraphService } from "./relationGraphService.js";

/**
 * In-memory fake GitPort test double. Holds raw file contents keyed by path
 * and exposes them via listAdrFiles/read exactly like a real adapter would,
 * but with zero actual I/O — matches this package's zero-I/O constraint for
 * its own tests.
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

function adrRaw(id: string, title: string, relations?: string): string {
  const relBlock = relations ? `relations:\n${relations}\n` : "";
  return `---
id: ${id}
title: ${title}
status: proposed
date: "2024-01-01"
${relBlock}---
Body for ${id}.
`;
}

describe("RelationGraphService", () => {
  it("returns outbound relations declared on the queried ADR", async () => {
    const files = new Map<string, string>([
      [
        "adr-0001.md",
        adrRaw("adr-0001", "First", "  - type: relates-to\n    target: adr-0002"),
      ],
      ["adr-0002.md", adrRaw("adr-0002", "Second")],
    ]);
    const svc = new RelationGraphService(new FakeGitPort(files));

    const result = await svc.relationsFor("adr-0001");

    expect(result).toContainEqual({
      type: "relates-to",
      target: "adr-0002",
      direction: "outbound",
    });
  });

  it("derives an inbound superseded-by entry when another ADR declares supersedes pointing at it", async () => {
    const files = new Map<string, string>([
      [
        "adr-0001.md",
        adrRaw("adr-0001", "New decision", "  - type: supersedes\n    target: adr-0002"),
      ],
      ["adr-0002.md", adrRaw("adr-0002", "Old decision")],
    ]);
    const svc = new RelationGraphService(new FakeGitPort(files));

    const targetView = await svc.relationsFor("adr-0002");
    expect(targetView).toContainEqual({
      type: "superseded-by",
      target: "adr-0001",
      direction: "inbound",
    });

    // The declaring ADR still shows its own outbound supersedes, unaffected.
    const sourceView = await svc.relationsFor("adr-0001");
    expect(sourceView).toContainEqual({
      type: "supersedes",
      target: "adr-0002",
      direction: "outbound",
    });
    expect(sourceView).not.toContainEqual(
      expect.objectContaining({ direction: "inbound" })
    );
  });

  it("shows symmetric relation types (relates-to, depends-on, conflicts-with) as the same type on both sides", async () => {
    const files = new Map<string, string>([
      [
        "adr-0001.md",
        adrRaw("adr-0001", "A", "  - type: depends-on\n    target: adr-0002"),
      ],
      ["adr-0002.md", adrRaw("adr-0002", "B")],
    ]);
    const svc = new RelationGraphService(new FakeGitPort(files));

    const sourceView = await svc.relationsFor("adr-0001");
    expect(sourceView).toContainEqual({
      type: "depends-on",
      target: "adr-0002",
      direction: "outbound",
    });

    const targetView = await svc.relationsFor("adr-0002");
    expect(targetView).toContainEqual({
      type: "depends-on",
      target: "adr-0001",
      direction: "inbound",
    });
  });

  it("relationsFor's result always includes both outbound and inbound entries together", async () => {
    const files = new Map<string, string>([
      [
        "adr-0001.md",
        adrRaw("adr-0001", "A", "  - type: relates-to\n    target: adr-0003"),
      ],
      [
        "adr-0002.md",
        adrRaw("adr-0002", "B", "  - type: conflicts-with\n    target: adr-0001"),
      ],
      ["adr-0003.md", adrRaw("adr-0003", "C")],
    ]);
    const svc = new RelationGraphService(new FakeGitPort(files));

    const view = await svc.relationsFor("adr-0001");
    expect(view).toContainEqual({
      type: "relates-to",
      target: "adr-0003",
      direction: "outbound",
    });
    expect(view).toContainEqual({
      type: "conflicts-with",
      target: "adr-0002",
      direction: "inbound",
    });
    expect(view).toHaveLength(2);
  });

  it("targetExists returns true for a known ADR id and false for an unknown one", async () => {
    const files = new Map<string, string>([
      ["adr-0001.md", adrRaw("adr-0001", "First")],
    ]);
    const svc = new RelationGraphService(new FakeGitPort(files));

    expect(await svc.targetExists("adr-0001")).toBe(true);
    expect(await svc.targetExists("adr-9999")).toBe(false);
  });

  it("recomputes live: removing a relation from the source ADR's declared list drops the reciprocal on the next call, with no separate removal step", async () => {
    const files = new Map<string, string>([
      [
        "adr-0001.md",
        adrRaw("adr-0001", "New decision", "  - type: supersedes\n    target: adr-0002"),
      ],
      ["adr-0002.md", adrRaw("adr-0002", "Old decision")],
    ]);
    const gitPort = new FakeGitPort(files);
    const svc = new RelationGraphService(gitPort);

    // Before "save": reciprocal is present.
    const before = await svc.relationsFor("adr-0002");
    expect(before).toContainEqual({
      type: "superseded-by",
      target: "adr-0001",
      direction: "inbound",
    });

    // Simulate AdrEditingService.save writing a new relations array without
    // that entry — there is no removal API on RelationGraphService itself;
    // the underlying GitPort data is simply mutated as a save would do.
    files.set("adr-0001.md", adrRaw("adr-0001", "New decision"));

    const after = await svc.relationsFor("adr-0002");
    expect(after).not.toContainEqual(
      expect.objectContaining({ direction: "inbound", type: "superseded-by" })
    );
    expect(after).toHaveLength(0);
  });
});
