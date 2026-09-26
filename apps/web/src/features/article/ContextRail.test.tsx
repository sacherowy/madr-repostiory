import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach, vi } from "vitest";
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

/**
 * "Related reading" feedback states (jev-similarity task 5.3, Req 9.1–9.7;
 * design.md Web layer > ContextRail "Related reading" state table).
 */
describe("ContextRail Related reading states", () => {
  const section = () => screen.getByTestId("context-rail-related-reading");

  // Hidden (9.6): no error and no results → the area stays hidden.
  it("hides the area when the scope holds no other decisions and nothing failed", () => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={[]}
        similarCoverage={null}
        similarErrorStatus={null}
        now={NOW}
      />
    );
    expect(screen.queryByTestId("context-rail-related-reading")).not.toBeInTheDocument();
    expect(screen.queryByText("Related reading")).not.toBeInTheDocument();
  });

  // List (9.6): coverage absent → existing list, no notice, no actions.
  it("renders the plain list when coverage is absent", () => {
    render(<ContextRail relations={[]} history={[]} similar={SIMILAR} similarCoverage={null} />);
    expect(screen.getAllByTestId("context-rail-related")).toHaveLength(2);
    expect(screen.getAllByTestId("context-rail-similarity-meter")).toHaveLength(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare all/i })).not.toBeInTheDocument();
    expect(section()).not.toHaveAttribute("aria-busy", "true");
  });

  // List (9.6): complete coverage (judged === total) → no capped notice.
  it("renders the plain list when every candidate was judged", () => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={SIMILAR}
        similarCoverage={{ judged: 2, total: 2 }}
      />
    );
    expect(screen.getAllByTestId("context-rail-related")).toHaveLength(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare all/i })).not.toBeInTheDocument();
  });

  // Capped (9.4, 9.7): list kept, status line announced, compare-all offered.
  it("shows a status line and a compare-all button when fewer were judged than exist", () => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={SIMILAR}
        similarCoverage={{ judged: 100, total: 150 }}
        onCompareAllSimilar={() => {}}
      />
    );
    expect(screen.getAllByTestId("context-rail-related")).toHaveLength(2);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Compared 100 of 150 related decisions.");
    expect(within(section()).getByRole("status")).toBe(status);
    const button = screen.getByRole("button", { name: "Compare all 150" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeEnabled();
    expect(section()).not.toHaveAttribute("aria-busy", "true");
  });

  // Comparing (9.5): list stays, button disabled with in-progress label, section busy.
  it("marks the section busy and disables the button while comparing all", () => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={SIMILAR}
        similarCoverage={{ judged: 100, total: 150 }}
        similarComparing
        onCompareAllSimilar={() => {}}
      />
    );
    expect(screen.getAllByTestId("context-rail-related")).toHaveLength(2);
    expect(section()).toHaveAttribute("aria-busy", "true");
    const button = screen.getByRole("button", { name: "Comparing all 150…" });
    expect(button).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Compare all 150" })).not.toBeInTheDocument();
  });

  // Error 503 (9.1, 9.2, 9.3, 9.7): heading kept, provider wording in an alert, retry.
  it("shows the provider-unavailable alert and a retry button on 503", () => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={[]}
        similarErrorStatus={503}
        onRetrySimilar={() => {}}
      />
    );
    expect(within(section()).getByText("Related reading")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Related reading is unavailable because the similarity service could not be reached."
    );
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).toHaveAttribute("type", "button");
    expect(screen.queryByTestId("context-rail-related")).not.toBeInTheDocument();
  });

  // Error other (9.1, 9.3): generic wording for any other status, incl. network (0).
  it.each([500, 404, 0])("shows the generic alert for status %i", (status) => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={[]}
        similarErrorStatus={status}
        onRetrySimilar={() => {}}
      />
    );
    expect(within(section()).getByText("Related reading")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Related decisions could not be loaded.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/similarity service/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  // An error on the exhaustive query replaces the capped list with the error state.
  it("replaces an existing capped list with the error state", () => {
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={SIMILAR}
        similarCoverage={{ judged: 100, total: 150 }}
        similarErrorStatus={503}
        onRetrySimilar={() => {}}
        onCompareAllSimilar={() => {}}
      />
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("context-rail-related")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /compare all/i })).not.toBeInTheDocument();
  });

  // Keyboard (9.7): both actions are native buttons operable with Enter / Space.
  it("activates compare-all from the keyboard", async () => {
    const user = userEvent.setup();
    const onCompareAll = vi.fn();
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={SIMILAR}
        similarCoverage={{ judged: 100, total: 150 }}
        onCompareAllSimilar={onCompareAll}
      />
    );
    screen.getByRole("button", { name: "Compare all 150" }).focus();
    await user.keyboard("{Enter}");
    expect(onCompareAll).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onCompareAll).toHaveBeenCalledTimes(2);
  });

  it("activates retry from the keyboard", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={[]}
        similarErrorStatus={500}
        onRetrySimilar={onRetry}
      />
    );
    screen.getByRole("button", { name: "Try again" }).focus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  // A disabled compare-all button cannot be activated while a comparison runs.
  it("does not call compare-all while comparing", async () => {
    const user = userEvent.setup();
    const onCompareAll = vi.fn();
    render(
      <ContextRail
        relations={[]}
        history={[]}
        similar={SIMILAR}
        similarCoverage={{ judged: 100, total: 150 }}
        similarComparing
        onCompareAllSimilar={onCompareAll}
      />
    );
    await user.click(screen.getByRole("button", { name: "Comparing all 150…" }));
    expect(onCompareAll).not.toHaveBeenCalled();
  });
});
