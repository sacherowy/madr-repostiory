import type { Adr, AdrSummary, FolderNode } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import { parseAdr } from "../adr/parse.js";

export type CreateFolderResult = { kind: "created"; node: FolderNode } | { kind: "conflict" };
export type MoveAdrResult = { kind: "moved"; adr: Adr } | { kind: "notFound" };

/** `path === "."` denotes the repository root throughout this service. */
function folderName(path: string): string {
  if (path === "." || path === "") return ".";
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function emptyNode(path: string): FolderNode {
  return { path, name: folderName(path), folders: [], adrs: [] };
}

/**
 * Creates folders, moves ADRs between folders, and assembles the folder/ADR
 * tree — all derived live from GitPort on every call (Req 11.1: git is the
 * sole authoritative source, nothing here is cached or persisted separately).
 *
 * Zero I/O: depends only on the injected GitPort and pure parsing/types.
 */
export class FolderService {
  constructor(private readonly git: GitPort) {}

  /**
   * Creates a folder at `path` by committing a `.gitkeep` placeholder.
   * Rejects with `{kind:"conflict"}` if a folder already exists at that
   * exact path (3.3).
   */
  async createFolder(path: string, author: string): Promise<CreateFolderResult> {
    const exists = await this.folderExistsAt(path);
    if (exists) return { kind: "conflict" };

    await this.git.writeAndCommit(`${path}/.gitkeep`, "", `create folder ${path}`, author);

    return { kind: "created", node: emptyNode(path) };
  }

  /**
   * Moves the ADR identified by `id` (resolved by scanning current ADR
   * files, since GitPort has no find-by-id lookup) into `targetFolder`,
   * keeping its filename. Identifier, content, and relations are untouched
   * by construction — git just moves the file; history continuity is
   * GitPort.log's existing --follow behavior (3.2).
   */
  async moveAdr(id: string, targetFolder: string, author: string): Promise<MoveAdrResult> {
    const found = await this.findAdrById(id);
    if (!found) return { kind: "notFound" };

    const filename = folderName(found.path);
    const toPath = targetFolder === "." ? filename : `${targetFolder}/${filename}`;

    await this.git.move(found.path, toPath, `move ${id} to ${targetFolder}`, author);

    const adr: Adr = { ...found.adr, path: toPath };
    return { kind: "moved", adr };
  }

  /**
   * Assembles the full folder/ADR tree rooted at `rootPath`, combining
   * GitPort.listTreeEntries (folder structure, including folders backed only
   * by a .gitkeep) with parsed ADR summaries from listAdrFiles+read+parseAdr.
   * Folders with zero children are included, never omitted (4.5).
   */
  async buildTree(rootPath: string): Promise<FolderNode> {
    const [treeEntries, adrFiles] = await Promise.all([
      this.git.listTreeEntries(rootPath),
      this.git.listAdrFiles(rootPath),
    ]);

    const nodes = new Map<string, FolderNode>();
    nodes.set(rootPath, emptyNode(rootPath));

    const parentPathOf = (path: string): string => {
      const idx = path.lastIndexOf("/");
      return idx === -1 ? rootPath : path.slice(0, idx);
    };

    const rootPrefix = rootPath === "." ? "" : `${rootPath}/`;
    const isUnderRoot = (path: string): boolean =>
      path !== rootPath && (rootPrefix === "" || path.startsWith(rootPrefix));

    /** Ensures a folder node exists for `path` and that every intermediate
     * ancestor between `path` and `rootPath` also exists and is linked into
     * its own parent's `folders` array, all the way up to the root. This
     * matters because GitPort.listTreeEntries does not always synthesize
     * every ancestor directory explicitly (e.g. a folder backed only by a
     * `.gitkeep` registers just that folder's own path, not its parents) —
     * so any missing intermediate folder must still be created here. */
    const linkToRoot = (path: string): FolderNode => {
      const existing = nodes.get(path);
      if (existing) return existing;

      const node = emptyNode(path);
      nodes.set(path, node);

      if (path !== rootPath && isUnderRoot(path)) {
        const parent = linkToRoot(parentPathOf(path));
        if (!parent.folders.includes(node)) parent.folders.push(node);
      }

      return node;
    };

    const folderPaths = treeEntries
      .filter((e) => e.type === "folder" && isUnderRoot(e.path))
      .map((e) => e.path);

    for (const path of folderPaths) {
      linkToRoot(path);
    }

    const summaries: { parent: string; summary: AdrSummary }[] = [];
    for (const file of adrFiles) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);
      summaries.push({
        parent: parentPathOf(file.path),
        summary: { id: adr.id, title: adr.title, status: adr.status, path: adr.path },
      });
    }

    for (const { parent, summary } of summaries) {
      const node = linkToRoot(parent);
      node.adrs.push(summary);
    }

    return nodes.get(rootPath)!;
  }

  /** True if a folder exists at exactly `path` (per GitPort.listTreeEntries
   * scoped to `path` itself — covers both .gitkeep-only folders and folders
   * containing further nested content). */
  private async folderExistsAt(path: string): Promise<boolean> {
    const entries = await this.git.listTreeEntries(path);
    return entries.some((e) => e.path === path && e.type === "folder");
  }

  /** Scans every current ADR file to find the one whose frontmatter id
   * matches; GitPort has no find-by-id lookup (mirrors RelationGraphService's
   * existing scan pattern). */
  private async findAdrById(id: string): Promise<{ path: string; adr: Adr } | null> {
    const files = await this.git.listAdrFiles(".");
    for (const file of files) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);
      if (adr.id === id) return { path: file.path, adr };
    }
    return null;
  }
}
