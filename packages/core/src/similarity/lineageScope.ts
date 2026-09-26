import type { LineagePosition } from "@adr/shared";

export interface LineageCandidate<T extends { path: string }> {
  item: T;
  position: LineagePosition;
}

/** Folder segments of a repository-relative POSIX path; the root folder is `[]`. */
function folderSegments(path: string): string[] {
  const segments = path.split("/").filter((s) => s !== "" && s !== ".");
  segments.pop();
  return segments;
}

/** True when `prefix` is a segment-wise prefix of `segments` (`a/b` is not a prefix of `a/bc`). */
function startsWithSegments(segments: readonly string[], prefix: readonly string[]): boolean {
  if (prefix.length > segments.length) return false;
  return prefix.every((s, i) => segments[i] === s);
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Lineage candidates of `targetPath` (4.1–4.5): every item in the target's folder (the anchor)
 * and its descendants (`down`), plus items directly in each ancestor up to the root (`up`).
 * Sibling branches are excluded. Returns the full lineage ordered by ascending level, then
 * `down` before `up`, then ascending path; the cap is taken as a prefix of this order (4.8).
 */
export function selectLineage<T extends { path: string }>(
  items: readonly T[],
  targetPath: string
): LineageCandidate<T>[] {
  const anchor = folderSegments(targetPath);
  const candidates: LineageCandidate<T>[] = [];

  for (const item of items) {
    if (item.path === targetPath) continue;
    const folder = folderSegments(item.path);
    if (startsWithSegments(folder, anchor)) {
      candidates.push({ item, position: { direction: "down", level: folder.length - anchor.length } });
    } else if (startsWithSegments(anchor, folder)) {
      candidates.push({ item, position: { direction: "up", level: anchor.length - folder.length } });
    }
  }

  return candidates.sort(
    (a, b) =>
      a.position.level - b.position.level ||
      (a.position.direction === b.position.direction ? 0 : a.position.direction === "down" ? -1 : 1) ||
      comparePaths(a.item.path, b.item.path)
  );
}
