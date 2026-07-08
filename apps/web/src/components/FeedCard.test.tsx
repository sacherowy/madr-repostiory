import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { FeedCard as FeedCardModel } from "@adr/shared";
import { PEOPLE_LABELS } from "@adr/shared";
import { FeedCard } from "./FeedCard.js";

// A fixed "now" so the relative timestamp is deterministic (card date is
// 2026-06-23 → "3 days ago" against 2026-06-26).
const NOW = new Date("2026-06-26T12:00:00Z");

const CARD: FeedCardModel = {
  id: "ADR-0007",
  title: "Adopt the decision feed portal",
  status: "accepted",
  path: "architecture/ADR-0007-decision-feed.md",
  topic: "architecture",
  date: "2026-06-23",
  decisionMakers: ["Ada Lovelace"],
  consulted: ["Grace Hopper"],
  informed: ["Alan Turing"],
  shortDescription: {
    text: "We chose an editorial portal, because stakeholders needed plain language.",
    source: "derived",
  },
};

function noop() {
  /* placeholder callback */
}

function getCard() {
  return screen.getByTestId("feed-card");
}

describe("FeedCard", () => {
  // Observable (task 5.1 / Req 2.3 + 1.5): a card renders from a feed payload
  // with every field visible and the status shown in plain language.
  it("renders title, plain-language status, short description, topic, people, and a friendly timestamp", () => {
    render(<FeedCard card={CARD} onOpen={noop} now={NOW} data-testid="feed-card" />);

    const card = getCard();
    const scoped = within(card);

    // Title (2.3).
    expect(scoped.getByText("Adopt the decision feed portal")).toBeInTheDocument();

    // Plain-language status via StatusBadge (2.3 + 1.1): "Decided", not the raw
    // stored "accepted" key.
    const badge = card.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass("badge--accepted");
    expect(badge).toHaveTextContent("Decided");
    expect(badge?.textContent).not.toContain("accepted");

    // One-line short description text (2.3).
    expect(
      scoped.getByText(
        "We chose an editorial portal, because stakeholders needed plain language."
      )
    ).toBeInTheDocument();

    // Topic shown as a plain-language "Topic" chip (2.3 + 1.3 folders-as-Topics).
    const topic = scoped.getByTestId("feed-card-topic");
    expect(topic).toHaveTextContent(/topic/i);
    expect(topic).toHaveTextContent("architecture");

    // People shown under the plain-language labels (1.5 / 2.3).
    const people = scoped.getByTestId("feed-card-people");
    expect(people).toHaveTextContent(PEOPLE_LABELS.decisionMakers); // "Decision owner"
    expect(people).toHaveTextContent(PEOPLE_LABELS.consulted); // "Input from"
    expect(people).toHaveTextContent(PEOPLE_LABELS.informed); // "Kept informed"
    expect(people).toHaveTextContent("Ada Lovelace");
    expect(people).toHaveTextContent("Grace Hopper");
    expect(people).toHaveTextContent("Alan Turing");
    // The raw camelCase stored field names never leak into the card (the plain
    // label "Kept informed" legitimately contains the word "informed", so only
    // the unambiguous stored keys are asserted here).
    expect(people.textContent).not.toContain("decisionMakers");
    expect(people.textContent).not.toContain("consulted");

    // Friendly relative timestamp derived from the card date (2.3).
    const time = scoped.getByTestId("feed-card-time");
    expect(time).toHaveTextContent("3 days ago");
    expect(time).toHaveAttribute("datetime", "2026-06-23");
  });

  it("invokes onOpen with the card id when the card is clicked", () => {
    const onOpen = vi.fn();
    render(<FeedCard card={CARD} onOpen={onOpen} now={NOW} data-testid="feed-card" />);

    fireEvent.click(getCard());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("ADR-0007");
  });

  it("invokes onOpen when the card is activated by keyboard (Enter / Space)", () => {
    const onOpen = vi.fn();
    render(<FeedCard card={CARD} onOpen={onOpen} now={NOW} data-testid="feed-card" />);

    const card = getCard();
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenNthCalledWith(1, "ADR-0007");
    expect(onOpen).toHaveBeenNthCalledWith(2, "ADR-0007");
  });

  it("exposes the card as an accessible activatable control naming the decision", () => {
    render(<FeedCard card={CARD} onOpen={noop} now={NOW} data-testid="feed-card" />);
    const control = screen.getByRole("button", { name: /Adopt the decision feed portal/i });
    expect(control).toHaveAttribute("data-testid", "feed-card");
  });

  it("uses the author-written summary text verbatim regardless of source provenance", () => {
    const authored: FeedCardModel = {
      ...CARD,
      shortDescription: { text: "A crisp author-written one-liner.", source: "summary" },
    };
    render(<FeedCard card={authored} onOpen={noop} now={NOW} data-testid="feed-card" />);
    expect(screen.getByText("A crisp author-written one-liner.")).toBeInTheDocument();
  });

  it("omits people groups whose stored field is empty, keeping the rest of the card", () => {
    const sparse: FeedCardModel = {
      ...CARD,
      decisionMakers: ["Ada Lovelace"],
      consulted: [],
      informed: [],
    };
    render(<FeedCard card={sparse} onOpen={noop} now={NOW} data-testid="feed-card" />);

    const people = screen.getByTestId("feed-card-people");
    expect(people).toHaveTextContent(PEOPLE_LABELS.decisionMakers);
    expect(people).not.toHaveTextContent(PEOPLE_LABELS.consulted);
    expect(people).not.toHaveTextContent(PEOPLE_LABELS.informed);
    // The rest of the card still renders.
    expect(screen.getByText("Adopt the decision feed portal")).toBeInTheDocument();
  });

  it("shows a friendly fallback topic label for root-level decisions", () => {
    const rootCard: FeedCardModel = { ...CARD, topic: "" };
    render(<FeedCard card={rootCard} onOpen={noop} now={NOW} data-testid="feed-card" />);
    const topic = screen.getByTestId("feed-card-topic");
    expect(topic).toHaveTextContent(/topic/i);
    expect(topic).toHaveTextContent("General");
  });

  it("is purely presentational: it renders standalone with no query/store provider and does no fetching", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // No QueryClientProvider / store wrapper here — a fetching component would throw.
    render(<FeedCard card={CARD} onOpen={noop} now={NOW} data-testid="feed-card" />);
    expect(getCard()).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("appends an extra className after its own design-system class and forwards data-testid", () => {
    render(<FeedCard card={CARD} onOpen={noop} now={NOW} className="extra" data-testid="feed-card" />);
    const card = getCard();
    expect(card).toHaveClass("feed-card");
    expect(card).toHaveClass("extra");
  });
});
