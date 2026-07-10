import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import type { CommitMeta, RelationView, SimilarityResult } from "@adr/shared";
import { ContextRail } from "./ContextRail.js";

/**
 * Relations arrive from `GET /api/adrs/:id/relations` as `RelationView` records
 * whose `type` is ALREADY reciprocal-resolved for inbound views (core's
 * relationGraphService flips the type), so the plain-language label is looked up
 * with the "outgoing" direction unconditionally — mirroring RelationChip. Here a
 * `superseded-by` reads "Replaced by", a `depends-on` reads "Builds on".
 */
const RELATIONS: RelationView[] = [
  { type: "superseded-by", target: "ADR-0002", direction: "outbound" },
  { type: "depends-on", target: "ADR-0009", direction: "inbound" },
];

/** Newest-first commit metadata as returned by `GET /api/adrs/:id/history`. */
const HISTORY: CommitMeta[] = [
  { sha: "aaaaaaa", author: "Marta", date: "2026-07-01", message: "Mark as decided" },
  { sha: "bbbbbbb", author: "Ken", date: "2026-06-20", message: "Draft the decision" },
];

/** Similar decisions from `GET /api/adrs/:id/similar` — each an AdrSummary + score. */
const SIMILAR: SimilarityResult[] = [
  {
    adr: { id: "ADR-0002", title: "Adopt PostgreSQL", status: "accepted", path: "db/ADR-0002.md" },
    score: 0.86,
  },
  {
    adr: { id: "ADR-0042", title: "Event sourcing", status: "proposed", path: "arch/ADR-0042.md" },
    score: 0.41,
  },
];

// A fixed "now" so friendly relative times are deterministic in assertions.
const NOW = new Date("2026-07-08T00:00:00Z");

afterEach(() => {
  cleanup();
});

describe("ContextRail", () => {
  // Observable (task 6.3 / Req 6.5): each relation renders as a plain-language
  // SENTENCE using the shared vocabulary label — not a raw enum, not a chip.
  it("renders relations as plain-language sentences using the vocabulary labels", () => {
    render(<ContextRail relations={RELATIONS} history={[]} similar={[]} now={NOW} />);

    const sentences = screen.getAllByTestId("context-rail-relation");
    expect(sentences).toHaveLength(2);

    // superseded-by → "Replaced by" (relationLabel, outgoing); the raw enum is absent.
    expect(sentences[0]).toHaveTextContent("Replaced by");
    expect(sentences[0]).not.toHaveTextContent("superseded-by");

    // depends-on → "Builds on".
    expect(sentences[1]).toHaveTextContent("Builds on");
    expect(sentences[1]).not.toHaveTextContent("depends-on");
  });

  // A relation whose target is among the similar decisions shows the target's
  // TITLE in the sentence; an unknown target falls back to its id.
  it("shows the target title when known and falls back to the id otherwise", () => {
    render(<ContextRail relations={RELATIONS} history={[]} similar={SIMILAR} now={NOW} />);

    const sentences = screen.getAllByTestId("context-rail-relation");
    // ADR-0002 is in SIMILAR → its title is used.
    expect(sentences[0]).toHaveTextContent("Replaced by Adopt PostgreSQL");
    // ADR-0009 is not resolvable → the id is the fallback display.
    expect(sentences[1]).toHaveTextContent("Builds on ADR-0009");
  });

  // Observable (task 6.3 / Req 1.4, 6.5): history renders as plain-language
  // "saved versions"/story sentences with a friendly (relative) date — never a
  // raw sha or ISO timestamp as the lead.
  it("renders history as plain-language story sentences with friendly dates", () => {
    render(<ContextRail relations={[]} history={HISTORY} similar={[]} now={NOW} />);

    const sentences = screen.getAllByTestId("context-rail-history");
    expect(sentences).toHaveLength(2);

    // Newest-first order is preserved.
    expect(sentences[0]).toHaveTextContent("Marta");
    expect(sentences[0]).toHaveTextContent("1 week ago"); // 2026-07-01 vs 2026-07-08
    expect(sentences[1]).toHaveTextContent("Ken");

    // Plain-language phrasing, not a bare sha.
    expect(sentences[0]).toHaveTextContent(/saved a version/i);
    expect(sentences[0]).not.toHaveTextContent("aaaaaaa");
  });

  // Observable (task 6.3 / Req 6.5, 15.2): related reading reuses the existing
  // SimilarityMeter — each entry carries a meter proportional to its score.
  it("renders related reading entries each carrying a similarity meter", () => {
    render(<ContextRail relations={[]} history={[]} similar={SIMILAR} now={NOW} />);

    const entries = screen.getAllByTestId("context-rail-related");
    expect(entries).toHaveLength(2);

    // Each entry shows the target title.
    expect(entries[0]).toHaveTextContent("Adopt PostgreSQL");
    expect(entries[1]).toHaveTextContent("Event sourcing");

    // Each entry carries a SimilarityMeter with the result's score value.
    const meters = screen.getAllByTestId("context-rail-similarity-meter");
    expect(meters).toHaveLength(2);
    expect(within(entries[0]).getByTestId("context-rail-similarity-meter")).toHaveTextContent(
      "0.86"
    );
    // The meter fill is proportional to the clamped score.
    const fill = entries[1].querySelector<HTMLElement>(".meter__fill");
    expect(fill?.style.width).toBe("41%");
  });

  // The three sections collapse independently when their data is empty, so an
  // article with no relations/history/similar renders an unobtrusive rail.
  it("omits a section when its data is empty", () => {
    render(<ContextRail relations={[]} history={HISTORY} similar={[]} now={NOW} />);

    expect(screen.queryByTestId("context-rail-relation")).not.toBeInTheDocument();
    expect(screen.queryByTestId("context-rail-related")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("context-rail-history")).toHaveLength(2);
  });
});
