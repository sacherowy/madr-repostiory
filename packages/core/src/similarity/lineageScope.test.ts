import { describe, it, expect } from "vitest";
import { selectLineage } from "./lineageScope.js";
import * as core from "../index.js";

const TARGET = "org/platform/payments/0001-target.md";

// Multi-level tree anchored at org/platform/payments/.
const TREE = [
  "0001-root-a.md",
  "0002-root-b.md",
  "org/0001-org.md",
  "org/platform/0001-platform.md",
  TARGET,
  "org/platform/payments/0002-payments-b.md",
  "org/platform/payments/0003-payments-a.md",
  "org/platform/payments/refunds/0001-refunds.md",
  "org/platform/payments/refunds/deep/0001-deep.md",
  // sibling team under an ancestor
  "org/platform/identity/0001-identity.md",
  "org/platform/identity/sso/0001-sso.md",
  // unrelated top-level folder
  "other/0001-other.md",
  // prefix traps: folder names that start with an anchor/ancestor folder name
  "org/platform/payments-v2/0001-payments-v2.md",
  "org/platform-legacy/0001-legacy.md",
  "org-archive/0001-archive.md",
].map((path) => ({ path }));

function summarize(items: readonly { path: string }[], target: string) {
  return selectLineage(items, target).map((c) => ({ path: c.item.path, ...c.position }));
}

describe("selectLineage", () => {
  it("returns the full lineage labeled and ordered by level, then down before up, then path (4.1–4.5, 4.8)", () => {
    expect(summarize(TREE, TARGET)).toEqual([
      { path: "org/platform/payments/0002-payments-b.md", direction: "down", level: 0 },
      { path: "org/platform/payments/0003-payments-a.md", direction: "down", level: 0 },
      { path: "org/platform/payments/refunds/0001-refunds.md", direction: "down", level: 1 },
      { path: "org/platform/0001-platform.md", direction: "up", level: 1 },
      { path: "org/platform/payments/refunds/deep/0001-deep.md", direction: "down", level: 2 },
      { path: "org/0001-org.md", direction: "up", level: 2 },
      { path: "0001-root-a.md", direction: "up", level: 3 },
      { path: "0002-root-b.md", direction: "up", level: 3 },
    ]);
  });

  it("excludes the target itself (4.2)", () => {
    const paths = summarize(TREE, TARGET).map((c) => c.path);
    expect(paths).not.toContain(TARGET);
  });

  it("includes every ADR in the anchor and all descendant folders (4.1, 4.2)", () => {
    const down = summarize(TREE, TARGET).filter((c) => c.direction === "down").map((c) => c.path);
    expect(new Set(down)).toEqual(
      new Set([
        "org/platform/payments/0002-payments-b.md",
        "org/platform/payments/0003-payments-a.md",
        "org/platform/payments/refunds/0001-refunds.md",
        "org/platform/payments/refunds/deep/0001-deep.md",
      ])
    );
  });

  it("includes only ADRs directly in each ancestor, up to and including the root (4.3)", () => {
    const up = summarize(TREE, TARGET).filter((c) => c.direction === "up").map((c) => c.path);
    expect(new Set(up)).toEqual(
      new Set(["org/platform/0001-platform.md", "org/0001-org.md", "0001-root-a.md", "0002-root-b.md"])
    );
  });

  it("excludes sibling branches, unrelated folders and prefix-named folders (4.4)", () => {
    const paths = summarize(TREE, TARGET).map((c) => c.path);
    for (const excluded of [
      "org/platform/identity/0001-identity.md",
      "org/platform/identity/sso/0001-sso.md",
      "other/0001-other.md",
      "org/platform/payments-v2/0001-payments-v2.md",
      "org/platform-legacy/0001-legacy.md",
      "org-archive/0001-archive.md",
    ]) {
      expect(paths).not.toContain(excluded);
    }
  });

  it("treats the target's prefix-named sibling as a separate anchor (4.4)", () => {
    const target = "org/platform/payments-v2/0001-payments-v2.md";
    const paths = summarize(TREE, target).map((c) => c.path);
    expect(paths).not.toContain("org/platform/payments/0002-payments-b.md");
    expect(paths).not.toContain("org/platform/payments/refunds/0001-refunds.md");
    expect(paths).toContain("org/platform/0001-platform.md");
  });

  it("anchors at the repository root for a root-level target: everything else is down (4.1, 4.5)", () => {
    expect(summarize(TREE, "0001-root-a.md").slice(0, 3)).toEqual([
      { path: "0002-root-b.md", direction: "down", level: 0 },
      { path: "org-archive/0001-archive.md", direction: "down", level: 1 },
      { path: "org/0001-org.md", direction: "down", level: 1 },
    ]);
    const all = summarize(TREE, "0001-root-a.md");
    expect(all).toHaveLength(TREE.length - 1);
    expect(all.every((c) => c.direction === "down")).toBe(true);
  });

  it("returns the original items and an empty list when the target is alone in its lineage (4.7 precondition)", () => {
    const items = [{ path: "a/x.md", extra: 1 }, { path: "b/y.md", extra: 2 }];
    expect(selectLineage(items, "a/x.md")).toEqual([]);
    const res = selectLineage([...items, { path: "a/z.md", extra: 3 }], "a/x.md");
    expect(res).toHaveLength(1);
    expect(res[0].item.extra).toBe(3);
  });

  it("is pure: does not mutate its input", () => {
    const input = TREE.slice();
    const before = input.map((i) => i.path);
    selectLineage(input, TARGET);
    expect(input.map((i) => i.path)).toEqual(before);
  });

  it("is re-exported from the core entry point", () => {
    expect(core.selectLineage).toBe(selectLineage);
  });
});
