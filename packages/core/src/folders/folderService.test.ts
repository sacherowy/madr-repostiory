import { describe, it, expect } from "vitest";
import type { GitPort, AdrFile, CommitMeta, DiffResult, TreeEntry } from "../ports/git.js";
import { FolderService } from "./folderService.js";

/**
 * In-memory fake GitPort test double. Mirrors the directory/file shape a real
 * repo would have: `files` holds raw ADR markdown content keyed by path,
 * `folders` holds folder paths that exist purely as a `.gitkeep` placeholder
 * (i.e. have no other tracked content). Zero actual I/O, matching this
 * package's zero-I/O constraint for its own tests (see relationGraphService.test.ts
 * for the established pattern this follows).
 */
class FakeGitPort implements GitPort {
  public moveCalls: Array<{ from: string; to: string; message: string; author: string }> = [];
  public writeCalls: Array<{ path: string; content: string; message: string; author: string }> =
    [];

  constructor(
    private files: Map<string, string>,
    private emptyFolders: string[] = []
  ) {}

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`not found: ${path}`);
    return content;
  }

  async currentBlobSha(): Promise<string | null> {
    throw new Error("not used in this test");
  }

  async writeAndCommit(
    path: string,
    content: string,
    message: string,
    author: string
  ): Promise<CommitMeta> {
    this.writeCalls.push({ path, content, message, author });
    this.files.set(path, content);
    return { sha: `sha-${path}`, author, date: "2024-01-01", message };
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

  /** Mirrors SimpleGitAdapter.listTreeEntries exactly, including its asymmetry:
   * a `.gitkeep`-only folder registers *only* its own direct path (no further
   * ancestor walk), while a regular tracked file (e.g. an `.md`) walks and
   * registers every ancestor directory up to (not including) the repo root. */
  async listTreeEntries(rootPath: string): Promise<TreeEntry[]> {
    const prefix = rootPath === "" || rootPath === "." ? "" : `${rootPath}/`;
    const entries = new Map<string, TreeEntry>();

    const addAncestors = (path: string) => {
      let dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      while (dir) {
        if (!entries.has(dir)) entries.set(dir, { path: dir, type: "folder" });
        dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
      }
    };

    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      if (path.endsWith(".md")) {
        entries.set(path, { path, type: "adr" });
      }
      addAncestors(path);
    }

    for (const folder of this.emptyFolders) {
      const underRoot = prefix === "" || folder === rootPath || folder.startsWith(prefix);
      if (!underRoot) continue;
      // Matches the real adapter: only the folder's own direct path is
      // registered for a .gitkeep-only folder, not its further ancestors.
      entries.set(folder, { path: folder, type: "folder" });
    }

    return [...entries.values()];
  }

  async move(fromPath: string, toPath: string, message: string, author: string): Promise<CommitMeta> {
    this.moveCalls.push({ from: fromPath, to: toPath, message, author });
    const content = this.files.get(fromPath);
    if (content === undefined) throw new Error(`move source not found: ${fromPath}`);
    this.files.delete(fromPath);
    this.files.set(toPath, content);
    return { sha: `sha-${toPath}`, author, date: "2024-01-01", message };
  }
}

function adrRaw(id: string, title: string, status = "proposed", relations?: string): string {
  const relBlock = relations ? `relations:\n${relations}\n` : "";
  return `---
id: ${id}
title: ${title}
status: ${status}
date: "2024-01-01"
${relBlock}---
Body for ${id}.
`;
}

describe("FolderService", () => {
  describe("createFolder", () => {
    it("returns created with a new empty FolderNode for a genuinely new path", async () => {
      const git = new FakeGitPort(new Map());
      const svc = new FolderService(git);

      const result = await svc.createFolder("decisions/archive", "Alice <alice@example.com>");

      expect(result.kind).toBe("created");
      if (result.kind === "created") {
        expect(result.node.path).toBe("decisions/archive");
        expect(result.node.folders).toEqual([]);
        expect(result.node.adrs).toEqual([]);
      }
      // The folder must be recorded via a committed .gitkeep placeholder.
      expect(git.writeCalls).toHaveLength(1);
      expect(git.writeCalls[0].path).toBe("decisions/archive/.gitkeep");
      expect(git.writeCalls[0].author).toBe("Alice <alice@example.com>");
    });

    it("returns conflict and does not write when a folder already exists at that exact path", async () => {
      const git = new FakeGitPort(new Map(), ["decisions/archive"]);
      const svc = new FolderService(git);

      const result = await svc.createFolder("decisions/archive", "Alice <alice@example.com>");

      expect(result).toEqual({ kind: "conflict" });
      expect(git.writeCalls).toHaveLength(0);
    });

    it("does not conflict with a folder that exists at a different path", async () => {
      const git = new FakeGitPort(new Map(), ["decisions/other"]);
      const svc = new FolderService(git);

      const result = await svc.createFolder("decisions/archive", "Alice <alice@example.com>");

      expect(result.kind).toBe("created");
    });
  });

  describe("moveAdr", () => {
    it("moves an ADR to the target folder, preserving id/content/relations under the new path", async () => {
      const files = new Map<string, string>([
        [
          "decisions/0001-first.md",
          adrRaw("adr-0001", "First decision", "proposed", "  - type: relates-to\n    target: adr-0002"),
        ],
        ["decisions/0002-second.md", adrRaw("adr-0002", "Second decision")],
      ]);
      const git = new FakeGitPort(files);
      const svc = new FolderService(git);

      const result = await svc.moveAdr("adr-0001", "archive", "Bob <bob@example.com>");

      expect(result.kind).toBe("moved");
      if (result.kind === "moved") {
        expect(result.adr.id).toBe("adr-0001");
        expect(result.adr.title).toBe("First decision");
        expect(result.adr.path).toBe("archive/0001-first.md");
        expect(result.adr.relations).toEqual([{ type: "relates-to", target: "adr-0002" }]);
        expect(result.adr.additionalContent).toBe("Body for adr-0001.");
      }
      expect(git.moveCalls).toEqual([
        {
          from: "decisions/0001-first.md",
          to: "archive/0001-first.md",
          message: expect.any(String),
          author: "Bob <bob@example.com>",
        },
      ]);
    });

    it("returns notFound for an unknown ADR id and performs no move", async () => {
      const files = new Map<string, string>([
        ["decisions/0001-first.md", adrRaw("adr-0001", "First decision")],
      ]);
      const git = new FakeGitPort(files);
      const svc = new FolderService(git);

      const result = await svc.moveAdr("adr-9999", "archive", "Bob <bob@example.com>");

      expect(result).toEqual({ kind: "notFound" });
      expect(git.moveCalls).toHaveLength(0);
    });
  });

  describe("buildTree", () => {
    it("assembles a nested tree with folders, ADR summaries (id/title/status), and an empty folder shown as present", async () => {
      const files = new Map<string, string>([
        ["decisions/0001-first.md", adrRaw("adr-0001", "First decision", "accepted")],
        ["decisions/archive/0002-second.md", adrRaw("adr-0002", "Second decision", "deprecated")],
      ]);
      const git = new FakeGitPort(files, ["decisions/empty-sub"]);
      const svc = new FolderService(git);

      const tree = await svc.buildTree(".");

      expect(tree.path).toBe(".");

      const decisions = tree.folders.find((f) => f.path === "decisions");
      expect(decisions).toBeDefined();
      expect(decisions!.name).toBe("decisions");
      expect(decisions!.adrs).toEqual([
        { id: "adr-0001", title: "First decision", status: "accepted", path: "decisions/0001-first.md" },
      ]);

      const archive = decisions!.folders.find((f) => f.path === "decisions/archive");
      expect(archive).toBeDefined();
      expect(archive!.adrs).toEqual([
        {
          id: "adr-0002",
          title: "Second decision",
          status: "deprecated",
          path: "decisions/archive/0002-second.md",
        },
      ]);

      // Empty folder (only a .gitkeep) must be present, not omitted, with empty children.
      const emptySub = decisions!.folders.find((f) => f.path === "decisions/empty-sub");
      expect(emptySub).toBeDefined();
      expect(emptySub!.name).toBe("empty-sub");
      expect(emptySub!.folders).toEqual([]);
      expect(emptySub!.adrs).toEqual([]);
    });

    it("returns an empty tree (no folders, no adrs) for a root with nothing under it", async () => {
      const git = new FakeGitPort(new Map());
      const svc = new FolderService(git);

      const tree = await svc.buildTree(".");

      expect(tree.folders).toEqual([]);
      expect(tree.adrs).toEqual([]);
    });

    it("places an ADR directly under the root in the root node's own adrs list", async () => {
      const files = new Map<string, string>([
        ["0001-top-level.md", adrRaw("adr-0001", "Top level decision", "proposed")],
      ]);
      const git = new FakeGitPort(files);
      const svc = new FolderService(git);

      const tree = await svc.buildTree(".");

      expect(tree.adrs).toEqual([
        { id: "adr-0001", title: "Top level decision", status: "proposed", path: "0001-top-level.md" },
      ]);
      expect(tree.folders).toEqual([]);
    });

    it("shows an empty folder as present and empty when it is queried directly as the tree root", async () => {
      // Mirrors task 2.2's explicit scenario: "the tree for a root containing
      // one folder with only a placeholder file shows that folder as present
      // and empty, not omitted" -- here the queried root itself is that folder.
      const git = new FakeGitPort(new Map(), ["decisions/empty-sub"]);
      const svc = new FolderService(git);

      const tree = await svc.buildTree("decisions/empty-sub");

      expect(tree.path).toBe("decisions/empty-sub");
      expect(tree.name).toBe("empty-sub");
      expect(tree.folders).toEqual([]);
      expect(tree.adrs).toEqual([]);
    });
  });
});
