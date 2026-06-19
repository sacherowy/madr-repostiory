import type { Adr } from "@adr/shared";
import type { CommitMeta, GitPort } from "../ports/git.js";
import { parseAdr } from "../adr/parse.js";

/**
 * Returns an ADR's version timeline (newest first, per GitPort.log /
 * simple-git's default ordering) and reconstructs its full content as of any
 * historical commit.
 *
 * Zero I/O: depends only on the injected GitPort. History is always read
 * live from git, never cached or persisted separately (Req 11.1).
 */
export class HistoryService {
  constructor(private readonly git: GitPort) {}

  async timeline(id: string): Promise<CommitMeta[]> {
    const found = await this.findAdrById(id);
    return this.git.log(found.path);
  }

  /**
   * The historical commit sha is reused as `Adr.blobSha` (third arg to
   * parseAdr) because GitPort has no method to fetch a blob sha for an
   * arbitrary historical ref+path. This is only valid for this read-only
   * view — AdrEditingService's concurrency check uses the *current*
   * blobSha, never a historical commit sha from here.
   */
  async versionAt(id: string, sha: string): Promise<Adr> {
    const found = await this.findAdrById(id);
    const raw = await this.git.read(found.path, sha);
    return parseAdr(raw, found.path, sha);
  }

  /** Scans every current ADR file to find the one whose frontmatter id
   * matches; GitPort has no find-by-id lookup (mirrors FolderService's and
   * RelationGraphService's existing scan pattern). Throws since this
   * service trusts its id-resolves precondition rather than handling the
   * failure gracefully (unlike FolderService.moveAdr's "notFound" result). */
  private async findAdrById(id: string): Promise<{ path: string; adr: Adr }> {
    const files = await this.git.listAdrFiles(".");
    for (const file of files) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);
      if (adr.id === id) return { path: file.path, adr };
    }
    throw new Error(`ADR not found: ${id}`);
  }
}
