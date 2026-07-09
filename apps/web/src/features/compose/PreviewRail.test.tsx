import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import {
  resolveShortDescription,
  PEOPLE_LABELS,
  type AdrId,
  type DerivationInput,
} from "@adr/shared";
import { PreviewRail, type PreviewRailProps } from "./PreviewRail.js";

/**
 * PreviewRail renders a live FeedCard from the unsaved compose form state via
 * the shared `resolveShortDescription` with a feed-backed (injected) title
 * resolver (design.md "UI compositions" → ComposePage; File Structure Plan →
 * `features/compose/PreviewRail.tsx`; Req 10.1-10.3).
 *
 * The component is pure/prop-driven: it takes the draft fields as props (title,
 * status/date/derivation, topic, people, summary) plus an optional title
 * resolver, so the "live update" (10.2) is just a re-render on prop change and
 * the tests need no backend. The previewed short description MUST come from the
 * same `resolveShortDescription` the feed/article/SummaryControl use so what the
 * author sees matches the feed (10.1); the source indicator reflects its layer
 * (10.3).
 */

// Fixed "now" so the FeedCard's relative timestamp stays deterministic (card
// date 2026-07-06 → "3 days ago" against 2026-07-09).
const NOW = new Date("2026-07-09T12:00:00Z");

/** Layer-2 derivation inputs (everything `resolveShortDescription` needs but `summary`). */
function baseDerivation(
  overrides: Partial<Omit<DerivationInput, "summary">> = {},
): Omit<DerivationInput, "summary"> {
  return {
    status: "proposed",
    decisionOutcome: "",
    consideredOptions: "",
    decisionDrivers: "",
    contextAndProblemStatement: "",
    date: "2026-07-06",
    relations: [],
    ...overrides,
  };
}

function baseProps(overrides: Partial<PreviewRailProps> = {}): PreviewRailProps {
  return {
    title: "Adopt the decision feed portal",
    topic: "architecture",
    summary: "",
    decisionMakers: ["Ada Lovelace"],
    consulted: ["Grace Hopper"],
    informed: ["Alan Turing"],
    derivation: baseDerivation(),
    now: NOW,
    ...overrides,
  };
}

function getCard() {
  return screen.getByTestId("compose-preview-card");
}

describe("PreviewRail", () => {
  // 10.1: the preview renders a real FeedCard from the unsaved form state — the
  // same presentational card the Home feed uses, populated from draft fields.
  it("renders a live FeedCard from the unsaved draft state", () => {
    render(<PreviewRail {...baseProps()} />);

    const card = getCard();
    // It IS the shared FeedCard, not a bespoke rebuild.
    expect(card).toHaveClass("feed-card");

    const scoped = within(card);
    // Title (10.2 field).
    expect(scoped.getByText("Adopt the decision feed portal")).toBeInTheDocument();
    // Plain-language status via the reused StatusBadge ("proposed" → "In discussion").
    expect(card.querySelector(".badge")).toHaveTextContent("In discussion");
    // Topic (10.2 field).
    expect(within(screen.getByTestId("feed-card-topic")).getByText("architecture")).toBeInTheDocument();
    // People under their plain-language labels (10.2 field).
    const people = within(screen.getByTestId("feed-card-people"));
    expect(people.getByText(PEOPLE_LABELS.decisionMakers)).toBeInTheDocument();
    expect(people.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(people.getByText("Grace Hopper")).toBeInTheDocument();
    expect(people.getByText("Alan Turing")).toBeInTheDocument();
  });

  // 10.1 (consistency): the previewed short description is exactly what the
  // shared resolver produces from the draft, so the preview matches the feed.
  it("sources the short description from the shared resolveShortDescription", () => {
    const derivation = baseDerivation({
      status: "accepted",
      decisionOutcome: 'Chosen option: "PostgreSQL", because it fits our audit needs',
    });
    render(<PreviewRail {...baseProps({ summary: "", derivation })} />);

    const expected = resolveShortDescription(
      { ...derivation, summary: "" },
      { resolveTitle: () => undefined },
    );
    expect(expected.source).toBe("derived");
    expect(within(getCard()).getByText(expected.text)).toBeInTheDocument();
  });

  // 10.2: editing a field that affects the card updates the live preview — the
  // component is prop-driven so a re-render reflects the new draft state.
  it("updates the live preview when the title, status, and summary change", () => {
    const { rerender } = render(<PreviewRail {...baseProps({ title: "First title" })} />);
    expect(within(getCard()).getByText("First title")).toBeInTheDocument();

    // Title edit.
    rerender(<PreviewRail {...baseProps({ title: "Second title" })} />);
    expect(within(getCard()).getByText("Second title")).toBeInTheDocument();
    expect(within(getCard()).queryByText("First title")).not.toBeInTheDocument();

    // Status edit (proposed → accepted): plain-language label follows.
    rerender(
      <PreviewRail {...baseProps({ title: "Second title", derivation: baseDerivation({ status: "accepted" }) })} />,
    );
    expect(getCard().querySelector(".badge")).toHaveTextContent("Decided");

    // Summary edit: author text now sources the previewed short description.
    rerender(
      <PreviewRail
        {...baseProps({ title: "Second title", summary: "We picked the portal for plain language." })}
      />,
    );
    expect(
      within(getCard()).getByText("We picked the portal for plain language."),
    ).toBeInTheDocument();
  });

  // 10.3: the rail indicates which layer sources the short description — authored
  // summary (layer 1) vs auto-derived (layer 2).
  it("indicates an authored summary as the short-description source", () => {
    render(<PreviewRail {...baseProps({ summary: "Author-written one-liner." })} />);

    const source = screen.getByTestId("compose-preview-source");
    expect(source).toHaveAttribute("data-source", "summary");
    expect(source).toHaveTextContent("Your summary");
    // The card shows the authored text.
    expect(within(getCard()).getByText("Author-written one-liner.")).toBeInTheDocument();
  });

  it("indicates a derived line as the short-description source when the summary is blank", () => {
    render(
      <PreviewRail
        {...baseProps({
          summary: "",
          derivation: baseDerivation({
            status: "accepted",
            decisionOutcome: 'Chosen option: "PostgreSQL", because it fits audit needs',
          }),
        })}
      />,
    );

    const source = screen.getByTestId("compose-preview-source");
    expect(source).toHaveAttribute("data-source", "derived");
    expect(source).toHaveTextContent("Auto-derived");
  });

  // 10.3 + feed-backed title resolver (12.3): a relation-derived "Replaced by
  // <title>" line resolves the target title through the injected resolver so the
  // preview text matches the real feed.
  it("uses the injected feed-backed title resolver for relation-derived text", () => {
    const target: AdrId = "ADR-0042";
    const resolveTitle = (id: AdrId): string | undefined =>
      id === target ? "The replacement decision" : undefined;
    render(
      <PreviewRail
        {...baseProps({
          summary: "",
          derivation: baseDerivation({
            status: "superseded",
            date: "2026-07-06",
            relations: [{ type: "superseded-by", target }],
          }),
          resolveTitle,
        })}
      />,
    );

    expect(
      within(getCard()).getByText("Replaced by The replacement decision on 2026-07-06"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("compose-preview-source")).toHaveAttribute("data-source", "derived");
  });
});
