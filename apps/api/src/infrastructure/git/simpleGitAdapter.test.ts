import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { SimpleGitAdapter } from "./simpleGitAdapter.js";

const AUTHOR = "Test Author <test@example.com>";

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-git-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("SimpleGitAdapter (tree listing, move, rename-aware history)", () => {
  let repoPath: string;
  let adapter: SimpleGitAdapter;

  beforeEach(async () => {
    repoPath = await initRepo();
    adapter = new SimpleGitAdapter(repoPath);
    // writeAndCommit does not create parent directories itself; tests that write
    // into subfolders must ensure the directory exists first.
    await mkdir(join(repoPath, "decisions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  describe("writeAndCommit", () => {
    it("creates the destination directory when writing into a brand-new, not-yet-existing subdirectory", async () => {
      // Note: unlike "decisions" (pre-created in beforeEach), "brand-new-folder" is
      // never mkdir'd before this call — writeAndCommit itself must create it.
      const result = await adapter.writeAndCommit(
        "brand-new-folder/0001-first.md",
        "# First\n",
        "add first adr in new folder",
        AUTHOR
      );

      expect(result.sha).toBeTruthy();
      expect(result.message).toBe("add first adr in new folder");

      const content = await adapter.read("brand-new-folder/0001-first.md");
      expect(content).toBe("# First\n");
    });
  });

  describe("listTreeEntries", () => {
    it("classifies .md files as adr entries and directories as folder entries", async () => {
      await adapter.writeAndCommit(
        "decisions/0001-use-postgres.md",
        "# Use Postgres\n",
        "add first adr",
        AUTHOR
      );

      const entries = await adapter.listTreeEntries(".");

      const adrEntry = entries.find((e) => e.path === "decisions/0001-use-postgres.md");
      expect(adrEntry).toMatchObject({ path: "decisions/0001-use-postgres.md", type: "adr" });

      const folderEntry = entries.find((e) => e.path === "decisions");
      expect(folderEntry).toMatchObject({ path: "decisions", type: "folder" });
    });

    it("surfaces empty folders that contain only a .gitkeep placeholder", async () => {
      await mkdir(join(repoPath, "empty-folder"), { recursive: true });
      await writeFile(join(repoPath, "empty-folder", ".gitkeep"), "");
      const git = simpleGit(repoPath);
      await git.add("empty-folder/.gitkeep");
      await git.commit("add empty folder placeholder", undefined, { "--author": AUTHOR });

      const entries = await adapter.listTreeEntries(".");

      const folderEntry = entries.find((e) => e.path === "empty-folder");
      expect(folderEntry).toMatchObject({ path: "empty-folder", type: "folder" });
      // The .gitkeep placeholder itself should not be surfaced as an ADR entry.
      expect(entries.find((e) => e.path === "empty-folder/.gitkeep")).toBeUndefined();
    });
  });

  describe("move", () => {
    it("moves an ADR to a new path as a single committed change, preserving content", async () => {
      const content = "# Use Postgres\n\nBody text.\n";
      await adapter.writeAndCommit("decisions/0001-use-postgres.md", content, "add adr", AUTHOR);

      const beforeLog = await adapter.log("decisions/0001-use-postgres.md");
      const commitCountBefore = beforeLog.length;

      const moveResult = await adapter.move(
        "decisions/0001-use-postgres.md",
        "archive/0001-use-postgres.md",
        "move adr to archive",
        AUTHOR
      );

      expect(moveResult.sha).toBeTruthy();
      expect(moveResult.message).toBe("move adr to archive");

      // Exactly one new commit: log on the new path should have exactly one more entry.
      const afterLog = await adapter.log("archive/0001-use-postgres.md");
      expect(afterLog.length).toBe(commitCountBefore + 1);

      const movedContent = await adapter.read("archive/0001-use-postgres.md");
      expect(movedContent).toBe(content);

      // Old path no longer exists at HEAD.
      const oldBlob = await adapter.currentBlobSha("decisions/0001-use-postgres.md");
      expect(oldBlob).toBeNull();
    });
  });

  describe("log (rename-aware history)", () => {
    it("returns history entries from both before and after a move", async () => {
      await adapter.writeAndCommit(
        "decisions/0001-use-postgres.md",
        "# Use Postgres\n",
        "initial version",
        AUTHOR
      );
      await adapter.writeAndCommit(
        "decisions/0001-use-postgres.md",
        "# Use Postgres\n\nUpdated.\n",
        "update before move",
        AUTHOR
      );

      await adapter.move(
        "decisions/0001-use-postgres.md",
        "archive/0001-use-postgres.md",
        "move adr to archive",
        AUTHOR
      );

      await adapter.writeAndCommit(
        "archive/0001-use-postgres.md",
        "# Use Postgres\n\nUpdated after move.\n",
        "update after move",
        AUTHOR
      );

      const history = await adapter.log("archive/0001-use-postgres.md");
      const messages = history.map((c) => c.message);

      expect(messages).toContain("update after move");
      expect(messages).toContain("move adr to archive");
      expect(messages).toContain("update before move");
      expect(messages).toContain("initial version");
      expect(history.length).toBe(4);
    });
  });
});
