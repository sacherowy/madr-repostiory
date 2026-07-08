import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { AdrRelation } from "@adr/shared";
import { AdrCard } from "./AdrCard.js";

const SAMPLE_RELATIONS: AdrRelation[] = [
  { type: "supersedes", target: "ADR-0007" },
  { type: "depends-on", target: "ADR-0002" },
];

function getCard() {
  return screen.getByTestId("adr-card");
}

describe("AdrCard", () => {
  // Req 3.1 + 3.2: a sample ADR renders, within ONE card root, the accent
  // element, the id chip (MonoChip), the status badge (StatusBadge), the title,
  // and one relation chip (RelationChip) per relation.
  it("renders accent, id chip, status badge, title, and a relation chip per relation within one card", () => {
    render(
      <AdrCard
        id="ADR-0001"
        title="Adopt the morski design system"
        status="accepted"
        relations={SAMPLE_RELATIONS}
        data-testid="adr-card"
      />
    );

    const card = getCard();
    expect(card).toHaveClass("card");

    // Accent: a REAL element (not a ::before pseudo-element) so it is assertable.
    const accent = card.querySelector(".card__accent");
    expect(accent).not.toBeNull();

    const scoped = within(card);

    // Req 3.1 id chip via MonoChip (teal id treatment) carrying the id text.
    const idChip = card.querySelector(".mono-chip--id");
    expect(idChip).not.toBeNull();
    expect(idChip).toHaveTextContent("ADR-0001");

    // Req 3.1 status via StatusBadge — the known-status modifier class.
    const badge = card.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass("badge--accepted");
    // Requirement 1.1: the status badge shows the plain-language label ("Decided").
    expect(badge).toHaveTextContent("Decided");

    // Req 3.1 title text.
    expect(scoped.getByText("Adopt the morski design system")).toBeInTheDocument();

    // Req 3.2 one RelationChip per relation, each with its type marker.
    const chips = card.querySelectorAll(".chip");
    expect(chips).toHaveLength(SAMPLE_RELATIONS.length);
    expect(card.querySelector(".chip--supersedes")).not.toBeNull();
    expect(card.querySelector(".chip--depends-on")).not.toBeNull();
  });

  // Req 3.2: with no relations, no relation chips render but the rest still does.
  it("renders no relation chips when relations is omitted but keeps id, status, and title", () => {
    render(
      <AdrCard id="ADR-0042" title="No relations here" status="proposed" data-testid="adr-card" />
    );

    const card = getCard();
    expect(card.querySelectorAll(".chip")).toHaveLength(0);
    expect(card.querySelector(".mono-chip--id")).toHaveTextContent("ADR-0042");
    expect(card.querySelector(".badge--proposed")).not.toBeNull();
    expect(within(card).getByText("No relations here")).toBeInTheDocument();
  });

  it("renders no relation chips when relations is an empty array", () => {
    render(
      <AdrCard
        id="ADR-0043"
        title="Empty relations"
        status="accepted"
        relations={[]}
        data-testid="adr-card"
      />
    );

    expect(getCard().querySelectorAll(".chip")).toHaveLength(0);
  });

  // Req 3.3: optional meta renders in the footer/meta region.
  it("renders meta content in a footer region when meta is provided", () => {
    render(
      <AdrCard
        id="ADR-0001"
        title="With metadata"
        status="accepted"
        meta={<span data-testid="card-meta-content">2026-06-23 · alice</span>}
        data-testid="adr-card"
      />
    );

    const card = getCard();
    const footer = card.querySelector(".card__footer, .card__meta");
    expect(footer).not.toBeNull();
    const meta = screen.getByTestId("card-meta-content");
    expect(meta).toHaveTextContent("2026-06-23 · alice");
    expect(footer).toContainElement(meta);
  });

  // Req 3.3: when meta is omitted, no footer region renders and nothing crashes.
  it("renders no footer region when meta is omitted", () => {
    render(<AdrCard id="ADR-0001" title="No metadata" status="accepted" data-testid="adr-card" />);

    const card = getCard();
    expect(card.querySelector(".card__footer")).toBeNull();
    // The card still renders its core parts.
    expect(card.querySelector(".mono-chip--id")).toHaveTextContent("ADR-0001");
    expect(within(card).getByText("No metadata")).toBeInTheDocument();
  });

  // BasePrimitiveProps passthrough: className appended after the design-system
  // class, data-testid forwarded to the card root.
  it("appends an extra className after its own design-system class", () => {
    render(
      <AdrCard
        id="ADR-0001"
        title="Custom class"
        status="accepted"
        className="custom-extra"
        data-testid="adr-card"
      />
    );

    const card = getCard();
    expect(card).toHaveClass("card");
    expect(card).toHaveClass("custom-extra");
  });

  it("forwards data-testid to the card root", () => {
    render(<AdrCard id="ADR-0001" title="Hook" status="accepted" data-testid="my-card" />);
    expect(screen.getByTestId("my-card")).toHaveClass("card");
  });
});
