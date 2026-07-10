import { useMemo, type ReactNode } from "react";
import type { AdrId, FeedCard as FeedCardModel } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { FeedCard } from "../../components/FeedCard.js";
import { useFeed } from "../../hooks/useFeed.js";
import "../../styles/people.css";

/**
 * A distinct person derived from the feed (design.md "UI compositions" →
 * PeoplePage; Req 4.1). People are grouped by a normalized `key` so that
 * different spellings of the same stored name collapse to one entry (Req 4.3),
 * while `name` preserves a human-friendly display spelling.
 */
export interface PersonNode {
  /** Normalized grouping key: the stored name trimmed and lowercased (Req 4.3). */
  key: string;
  /**
   * Display name: the first-seen trimmed original spelling for this key, so the
   * directory shows a real name rather than the lowercased key.
   */
  name: string;
  /** Number of distinct decisions this person appears on, in any role. */
  count: number;
}

/**
 * Case-insensitive, whitespace-trimmed grouping key for a stored person name
 * (Req 4.3). `"Marta"`, `" marta "`, and `"MARTA"` all normalize to `"marta"`,
 * so they group under a single person.
 */
export function normalizePersonKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Every stored person name on a card, across all three role fields. */
function peopleOf(card: FeedCardModel): string[] {
  return [...card.decisionMakers, ...card.consulted, ...card.informed];
}

/**
 * Decisions where the given normalized person `key` appears in ANY of the
 * Decision owner / Input from / Kept informed roles (Req 4.2). Matching is by
 * the normalized key, so case and surrounding whitespace never split a person.
 */
export function filterCardsForPerson(
  cards: readonly FeedCardModel[],
  key: string
): FeedCardModel[] {
  return cards.filter((card) =>
    peopleOf(card).some((name) => normalizePersonKey(name) === key)
  );
}

/**
 * Projects the feed cards into the list of distinct people (Req 4.1), a pure
 * client-side grouping over the three people fields of `FeedCard` — no new
 * endpoint. Each person is grouped by `normalizePersonKey` (Req 4.3); the
 * display `name` is the first-seen trimmed original spelling for that key, and
 * `count` is the number of distinct decisions the person appears on (a person
 * holding multiple roles on one decision still counts that decision once).
 *
 * Cards are scanned in feed order and, within each card, in role order
 * (owner → input → informed), so "first-seen" is deterministic. Empty and
 * whitespace-only names contribute no person. Nodes are returned sorted by key
 * so the directory order is stable.
 */
export function derivePeople(cards: readonly FeedCardModel[]): PersonNode[] {
  const byKey = new Map<string, { name: string; decisions: Set<AdrId> }>();

  for (const card of cards) {
    for (const rawName of peopleOf(card)) {
      const key = normalizePersonKey(rawName);
      if (key === "") continue;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, { name: rawName.trim(), decisions: new Set([card.id]) });
      } else {
        existing.decisions.add(card.id);
      }
    }
  }

  const nodes: PersonNode[] = [...byKey.entries()].map(([key, value]) => ({
    key,
    name: value.name,
    count: value.decisions.size,
  }));

  nodes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return nodes;
}

export interface PeoplePageProps {
  /** Data source for the feed (people are a client projection over it). */
  apiClient: ApiClient;
  /**
   * The selected person's normalized key, or `undefined` to list all people.
   * A key switches to that person's decisions across every role (Req 4.2).
   * The key (not the display name) is carried so case/whitespace variants of a
   * stored name resolve to the same person.
   */
  selectedPerson?: string;
  /** Fired to navigate INTO a person from the list (Req 4.1 → 4.2). */
  onSelectPerson: (key: string) => void;
  /** Fired when a decision card is opened, mirroring HomePage's contract (Req 2.6). */
  onOpenDecision: (id: AdrId) => void;
  /** Injectable "now" forwarded to each FeedCard for deterministic timestamps. */
  now?: Date;
}

/**
 * People destination (design.md File Structure → `PeoplePage`; Req 4.1-4.3).
 * With no `selectedPerson` it lists every distinct person who appears as a
 * Decision owner, Input from, or Kept informed on any decision, grouped by a
 * case-insensitive, whitespace-trimmed match of the stored name (Req 4.1, 4.3);
 * selecting one navigates via `onSelectPerson` with the normalized key. With a
 * `selectedPerson` key it shows that person's decisions across all three roles
 * (Req 4.2), or an inviting empty state when the person has none.
 *
 * People are a pure client projection over the `["feed"]` query (shared with
 * HomePage/TopicsPage via `useFeed`), so no new endpoint is introduced.
 */
export function PeoplePage({
  apiClient,
  selectedPerson,
  onSelectPerson,
  onOpenDecision,
  now,
}: PeoplePageProps) {
  const feed = useFeed(apiClient);
  const cards = useMemo(() => feed.data ?? [], [feed.data]);

  const people = useMemo(() => derivePeople(cards), [cards]);
  const personCards = useMemo(
    () => (selectedPerson === undefined ? [] : filterCardsForPerson(cards, selectedPerson)),
    [cards, selectedPerson]
  );
  const selectedName = useMemo(
    () => people.find((p) => p.key === selectedPerson)?.name ?? selectedPerson,
    [people, selectedPerson]
  );

  let content: ReactNode;
  if (feed.isPending) {
    content = (
      <div className="state state--loading" data-testid="people-loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading people…</p>
      </div>
    );
  } else if (feed.isError) {
    content = (
      <div className="state state--error" data-testid="people-error">
        <p className="state__title">Couldn’t load people.</p>
        <p className="state__message">Please try again in a moment.</p>
      </div>
    );
  } else if (selectedPerson === undefined) {
    // People directory view.
    content =
      people.length === 0 ? (
        <div className="state state--empty" data-testid="people-empty">
          <p className="state__title">No people yet.</p>
          <p className="state__message">
            People appear here as decisions name a Decision owner, Input from, or
            Kept informed.
          </p>
        </div>
      ) : (
        <ul className="people__list" data-testid="people-list">
          {people.map((person) => (
            <li key={person.key} className="people__list-item">
              <button
                type="button"
                className="person-item"
                data-testid={`person-item-${person.key}`}
                data-person-key={person.key}
                aria-label={`Browse decisions involving ${person.name}`}
                onClick={() => onSelectPerson(person.key)}
              >
                <span className="person-item__name">{person.name}</span>
                <span className="person-item__count" aria-hidden="true">
                  {person.count}
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
  } else {
    // Per-person feed view.
    content = (
      <section className="people__person" aria-label={`Decisions involving ${selectedName}`}>
        <h2 className="people__person-heading" data-testid="person-heading">
          {selectedName}
        </h2>
        {personCards.length === 0 ? (
          <div className="state state--empty" data-testid="person-empty">
            <p className="state__title">No decisions for this person yet.</p>
            <p className="state__message">
              Decisions naming “{selectedName}” as a Decision owner, Input from,
              or Kept informed will show up here.
            </p>
          </div>
        ) : (
          <ul className="people__feed" data-testid="person-feed">
            {personCards.map((card) => (
              <li key={card.id} className="people__feed-item">
                <FeedCard card={card} onOpen={onOpenDecision} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="people" data-testid="people-page">
      {content}
    </div>
  );
}
