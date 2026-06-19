import { simpleGit, type SimpleGit } from "simple-git";
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import type { GitPort, CommitMeta, DiffResult, AdrFile, TreeEntry } from "@adr/core";

export class SimpleGitAdapter implements GitPort {
  private git: SimpleGit;
  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  read(path: string, ref = "HEAD"): Promise<string> {
    return this.git.show([`${ref}:${path}`]);
  }

  async currentBlobSha(path: string): Promise<string | null> {
    try {
      return (await this.git.raw(["rev-parse", `HEAD:${path}`])).trim();
    } catch {
      return null;
    }
  }

  async writeAndCommit(
    path: string,
    content: string,
    message: string,
    author: string
  ): Promise<CommitMeta> {
    await mkdir(join(this.repoPath, dirname(path)), { recursive: true });
    await writeFile(join(this.repoPath, path), content, "utf8");
    await this.git.add(path);
    await this.git.commit(message, undefined, { "--author": author });
    const c = (await this.git.log({ maxCount: 1 })).latest!;
    return { sha: c.hash, author: c.author_name, date: c.date, message: c.message };
  }

  async log(path: string): Promise<CommitMeta[]> {
    const log = await this.git.log({ file: path, "--follow": null });
    return log.all.map((c) => ({
      sha: c.hash,
      author: c.author_name,
      date: c.date,
      message: c.message,
    }));
  }

  async diff(from: string, to: string, path?: string): Promise<DiffResult> {
    const args = [`${from}..${to}`];
    if (path) args.push("--", path);
    return { from, to, patch: await this.git.diff(args) };
  }

  async listAdrFiles(branchPath: string): Promise<AdrFile[]> {
    const out = await this.git.raw(["ls-tree", "-r", "HEAD", "--", branchPath]);
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [meta, file] = line.split("\t");
        return { path: file, blobSha: meta.split(/\s+/)[2] };
      })
      .filter((f) => f.path.endsWith(".md"));
  }

  async move(
    fromPath: string,
    toPath: string,
    message: string,
    author: string
  ): Promise<CommitMeta> {
    await mkdir(join(this.repoPath, dirname(toPath)), { recursive: true });
    await this.git.mv(fromPath, toPath);
    await this.git.commit(message, undefined, { "--author": author });
    const c = (await this.git.log({ maxCount: 1 })).latest!;
    return { sha: c.hash, author: c.author_name, date: c.date, message: c.message };
  }

  async listTreeEntries(rootPath: string): Promise<TreeEntry[]> {
    const out = await this.git.raw(["ls-tree", "-r", "--name-only", "HEAD", "--", rootPath]);
    const files = out.split("\n").filter(Boolean);

    const entries = new Map<string, TreeEntry>();
    for (const file of files) {
      if (basename(file) === ".gitkeep") {
        const folder = dirname(file);
        if (folder && folder !== ".") entries.set(folder, { path: folder, type: "folder" });
        continue;
      }
      if (file.endsWith(".md")) {
        entries.set(file, { path: file, type: "adr" });
      }
      let dir = dirname(file);
      while (dir && dir !== "." && dir !== "/") {
        if (!entries.has(dir)) entries.set(dir, { path: dir, type: "folder" });
        dir = dirname(dir);
      }
    }

    return [...entries.values()];
  }
}
