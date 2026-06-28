import type { Adr, AdrCompareView, DiffHunk, FieldComparison, VersionDiffView } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import { parseAdr } from "../adr/parse.js";

export type VersionDiffResult = { kind: "ok"; view: VersionDiffView } | { kind: "invalid"; reason: string };
export type AdrDiffResult = { kind: "ok"; view: AdrCompareView } | { kind: "invalid"; reason: string };

const FIELD_NAMES = ["title", "status", "date", "decisionMakers", "consulted", "informed", "tags", "body"] as const;

/** Comma-joined stringification for array fields; undefined and [] both
 * collapse to "" so an unset field never appears to "differ" from an
 * explicitly empty one (7.2/8.2 only care about content differences). */
function stringifyList(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

function fieldValue(adr: Adr, field: (typeof FIELD_NAMES)[number]): string {
  switch (field) {
    case "decisionMakers":
    case "consulted":
    case "informed":
    case "tags":
      return stringifyList(adr[field]);
    default:
      return String(adr[field]);
  }
}

/**
 * Compares ADR versions (content diff over time) and distinct ADRs (field
 * diff). Both operations are read-only: GitPort is only ever queried (log,
 * read, diff), never written to.
 *
 * Zero I/O: depends only on the injected GitPort.
 */
export class ComparisonService {
  constructor(private readonly git: GitPort) {}

  /**
   * Unlike HistoryService.findAdrById (which throws, trusting its caller's
   * precondition), every rejection path here returns {kind:"invalid"}
   * because ComparisonService's own interface has an explicit invalid
   * variant for exactly this class of caller error — so we use it
   * consistently instead of throwing.
   */
  async versionDiff(id: string, from: string, to: string): Promise<VersionDiffResult> {
    if (!from || !to) {
      return { kind: "invalid", reason: "both a 'from' and a 'to' version are required" };
    }

    const found = await this.findAdrById(id);
    if (!found) return { kind: "invalid", reason: `ADR not found: ${id}` };

    const log = await this.git.log(found.path);
    const fromMeta = log.find((c) => c.sha === from);
    const toMeta = log.find((c) => c.sha === to);
    if (!fromMeta || !toMeta) {
      return {
        kind: "invalid",
        reason: "the two versions must both belong to the same ADR",
      };
    }

    const { patch } = await this.git.diff(from, to, found.path);
    const hunks = parsePatch(patch);

    return { kind: "ok", view: { from: fromMeta, to: toMeta, hunks } };
  }

  async adrDiff(idA: string, idB: string): Promise<AdrDiffResult> {
    if (idA === idB) {
      return { kind: "invalid", reason: "two distinct ADRs are required for comparison" };
    }

    const [foundA, foundB] = await Promise.all([this.findAdrById(idA), this.findAdrById(idB)]);
    if (!foundA) return { kind: "invalid", reason: `ADR not found: ${idA}` };
    if (!foundB) return { kind: "invalid", reason: `ADR not found: ${idB}` };

    const fields: FieldComparison[] = FIELD_NAMES.map((field) => {
      const a = fieldValue(foundA.adr, field);
      const b = fieldValue(foundB.adr, field);
      return { field, a, b, differs: a !== b };
    });

    return { kind: "ok", view: { a: foundA.adr, b: foundB.adr, fields } };
  }

  /** Scans every current ADR file to find the one whose frontmatter id
   * matches; GitPort has no find-by-id lookup (mirrors HistoryService's /
   * FolderService's existing scan pattern, but returns null instead of
   * throwing — see the throw-vs-invalid-result note on versionDiff above). */
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

/** Parses raw unified-diff text (exactly `git diff <from>..<to> -- <path>`'s
 * stdout, confirmed against a real git invocation) into tagged DiffHunk[].
 * Metadata lines (diff --git/index/---/+++/@@) carry no content and are
 * skipped; the final newline-split's trailing empty string is also skipped. */
function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  for (const line of patch.split("\n")) {
    if (line === "") continue;
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("@@")
    ) {
      continue;
    }
    if (line.startsWith("+")) {
      hunks.push({ kind: "added", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      hunks.push({ kind: "removed", text: line.slice(1) });
    } else if (line.startsWith(" ")) {
      hunks.push({ kind: "unchanged", text: line.slice(1) });
    }
  }
  return hunks;
}
