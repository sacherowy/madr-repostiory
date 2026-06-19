import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { RelationGraphService } from "@adr/core";
import { SimpleGitAdapter } from "./simpleGitAdapter.js";

const AUTHOR = "Test Author <test@example.com>";

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

async function initRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "adr-git-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test Author");
  await git.addConfig("user.email", "test@example.com");
  return dir;
}

describe("RelationGraphService wired to the real SimpleGitAdapter", () => {
  let repoPath: string;
  let adapter: SimpleGitAdapter;
  let service: RelationGraphService;

  beforeEach(async () => {
    repoPath = await initRepo();
    adapter = new SimpleGitAdapter(repoPath);
    service = new RelationGraphService(adapter);
  });

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true });
  });

  it("computes inbound relations against a real git repo without throwing on the pathspec used to scan all ADRs", async () => {
    await adapter.writeAndCommit(
      "decisions/0001-first.md",
      adrRaw("adr-0001", "First decision", "  - type: relates-to\n    target: adr-0002"),
      "add first",
      AUTHOR
    );
    await adapter.writeAndCommit(
      "decisions/0002-second.md",
      adrRaw("adr-0002", "Second decision"),
      "add second",
      AUTHOR
    );

    const views = await service.relationsFor("adr-0002");

    expect(views).toEqual([{ type: "relates-to", target: "adr-0001", direction: "inbound" }]);
  });

  it("reports an existing target id as existing against a real git repo", async () => {
    await adapter.writeAndCommit(
      "decisions/0001-first.md",
      adrRaw("adr-0001", "First decision"),
      "add first",
      AUTHOR
    );

    await expect(service.targetExists("adr-0001")).resolves.toBe(true);
    await expect(service.targetExists("adr-9999")).resolves.toBe(false);
  });
});
