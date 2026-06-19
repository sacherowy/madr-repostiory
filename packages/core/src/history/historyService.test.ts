import { describe, it, expect } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import { HistoryService } from "./historyService.js";

/**
 * In-memory fake GitPort test double. `files` holds the *current* raw ADR
 * markdown content keyed by path (used for id resolution, mirroring
 * RelationGraphService/FolderService's scan pattern). `historical` holds
 * content as of a specific ref, keyed by `${path}@${ref}`, modeling what
 * real git's `git show ref:path` does (see SimpleGitAdapter.read) — distinct
 * refs of the same path can have different content (e.g. a changed title).
 * `logs` holds canned CommitMeta[] per path, returned verbatim and unsorted
 * by the service. Zero actual I/O, per this package's zero-I/O constraint.
 */
class FakeGitPort implements GitPort {
  public readCalls: Array<{ path: string; ref?: string }> = [];
  public logCalls: string[] = [];
  public listAdrFilesCalls: string[] = [];

  constructor(
    private files: Map<string, string>,
    private historical: Map<string, string> = new Map(),
    private logs: Map<string, CommitMeta[]> = new Map()
  ) {}

  async read(path: string, ref?: string): Promise<string> {
    this.readCalls.push({ path, ref });
    if (ref !== undefined) {
      const content = this.historical.get(`${path}@${ref}`);
      if (content === undefined) throw new Error(`not found: ${path}@${ref}`);
      return content;
    }
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
    this.logCalls.push(path);
    const entries = this.logs.get(path);
    if (entries === undefined) throw new Error(`no log configured for: ${path}`);
    return entries;
  }

  async diff(): Promise<DiffResult> {
    throw new Error("not used in this test");
  }

  async listAdrFiles(branchPath: string): Promise<AdrFile[]> {
    this.listAdrFilesCalls.push(branchPath);
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

function adrRaw(id: string, title: string, status = "proposed"): string {
  return `---
id: ${id}
title: ${title}
status: ${status}
date: "2024-01-01"
---
Body for ${id}.
`;
}

describe("HistoryService", () => {
  describe("timeline", () => {
    it("returns the resolved ADR's commits from GitPort.log, unchanged and unsorted, for a multi-entry history", async () => {
      const files = new Map<string, string>([["decisions/0001-first.md", adrRaw("adr-0001", "First")]]);
      const commits: CommitMeta[] = [
        { sha: "sha-3", author: "Carol <carol@example.com>", date: "2024-03-01", message: "third edit" },
        { sha: "sha-2", author: "Bob <bob@example.com>", date: "2024-02-01", message: "second edit" },
        { sha: "sha-1", author: "Alice <alice@example.com>", date: "2024-01-01", message: "initial" },
      ];
      const logs = new Map<string, CommitMeta[]>([["decisions/0001-first.md", commits]]);
      const git = new FakeGitPort(files, new Map(), logs);
      const svc = new HistoryService(git);

      const result = await svc.timeline("adr-0001");

      expect(result).toEqual(commits);
      expect(git.logCalls).toEqual(["decisions/0001-first.md"]);
    });

    it("returns exactly one entry for an ADR with only one saved version", async () => {
      const files = new Map<string, string>([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const commits: CommitMeta[] = [
        { sha: "sha-1", author: "Alice <alice@example.com>", date: "2024-01-01", message: "initial" },
      ];
      const logs = new Map<string, CommitMeta[]>([["0001-first.md", commits]]);
      const git = new FakeGitPort(files, new Map(), logs);
      const svc = new HistoryService(git);

      const result = await svc.timeline("adr-0001");

      expect(result).toHaveLength(1);
      expect(result).toEqual(commits);
    });

    it("throws a clear Error for an unknown ADR id", async () => {
      const files = new Map<string, string>([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new HistoryService(git);

      await expect(svc.timeline("adr-9999")).rejects.toThrow();
    });

    it("scans with the whole-repo pathspec '.', never an empty string", async () => {
      const files = new Map<string, string>([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const logs = new Map<string, CommitMeta[]>([
        ["0001-first.md", [{ sha: "sha-1", author: "Alice", date: "2024-01-01", message: "initial" }]],
      ]);
      const git = new FakeGitPort(files, new Map(), logs);
      const svc = new HistoryService(git);

      await svc.timeline("adr-0001");

      expect(git.listAdrFilesCalls).toEqual(["."]);
    });
  });

  describe("versionAt", () => {
    it("returns the parsed Adr content as of the given historical sha, reflecting that version's own frontmatter", async () => {
      const files = new Map<string, string>([["0001-first.md", adrRaw("adr-0001", "New Title")]]);
      const historical = new Map<string, string>([
        ["0001-first.md@sha-old", adrRaw("adr-0001", "Old Title")],
      ]);
      const git = new FakeGitPort(files, historical);
      const svc = new HistoryService(git);

      const result = await svc.versionAt("adr-0001", "sha-old");

      expect(result.title).toBe("Old Title");
      expect(result.id).toBe("adr-0001");
      expect(result.path).toBe("0001-first.md");
      expect(result.blobSha).toBe("sha-old");
      expect(result.body).toBe("Body for adr-0001.");
    });

    it("throws a clear Error for an unknown ADR id", async () => {
      const files = new Map<string, string>([["0001-first.md", adrRaw("adr-0001", "First")]]);
      const git = new FakeGitPort(files);
      const svc = new HistoryService(git);

      await expect(svc.versionAt("adr-9999", "sha-old")).rejects.toThrow();
    });

    it("passes the resolved path and given sha through to GitPort.read as the ref", async () => {
      const files = new Map<string, string>([["decisions/0001-first.md", adrRaw("adr-0001", "Current")]]);
      const historical = new Map<string, string>([
        ["decisions/0001-first.md@sha-old", adrRaw("adr-0001", "Past")],
      ]);
      const git = new FakeGitPort(files, historical);
      const svc = new HistoryService(git);

      await svc.versionAt("adr-0001", "sha-old");

      expect(git.readCalls).toContainEqual({ path: "decisions/0001-first.md", ref: "sha-old" });
    });
  });
});
