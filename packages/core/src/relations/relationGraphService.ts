import type { RelationType, RelationView } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import { parseAdr } from "../adr/parse.js";

/** Reciprocal type for each declared relation type. supersedes/superseded-by
 * are an asymmetric pair; the rest are symmetric (same type on both sides). */
const RECIPROCAL: Record<RelationType, RelationType> = {
  supersedes: "superseded-by",
  "superseded-by": "supersedes",
  "relates-to": "relates-to",
  "depends-on": "depends-on",
  "conflicts-with": "conflicts-with",
};

/**
 * Computes, for a given ADR id, every relationship it participates in —
 * both the ones it declares (outbound) and the ones other ADRs declare
 * pointing to it (inbound, with the reciprocal type derived).
 *
 * Zero I/O: depends only on the injected GitPort. Never caches or persists
 * relation state — every call rescans current git content, so removing a
 * relation from an ADR's declared list (e.g. via a future save) causes its
 * reciprocal to stop appearing on the next call, with no separate removal
 * step (Req 5.5, 11.1).
 */
export class RelationGraphService {
  constructor(private readonly git: GitPort) {}

  async relationsFor(id: string): Promise<RelationView[]> {
    const files = await this.git.listAdrFiles("");
    const views: RelationView[] = [];

    for (const file of files) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);

      if (adr.id === id) {
        for (const relation of adr.relations ?? []) {
          views.push({
            type: relation.type,
            target: relation.target,
            direction: "outbound",
          });
        }
      } else {
        for (const relation of adr.relations ?? []) {
          if (relation.target === id) {
            views.push({
              type: RECIPROCAL[relation.type],
              target: adr.id,
              direction: "inbound",
            });
          }
        }
      }
    }

    return views;
  }

  async targetExists(targetId: string): Promise<boolean> {
    const files = await this.git.listAdrFiles("");
    for (const file of files) {
      const raw = await this.git.read(file.path);
      const adr = parseAdr(raw, file.path, file.blobSha);
      if (adr.id === targetId) return true;
    }
    return false;
  }
}
