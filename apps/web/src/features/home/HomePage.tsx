import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  STATUS_LABELS,
  type AdrId,
  type AdrStatus,
  type FeedCard as FeedCardModel,
  type SearchHit,
} from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { FeedCard } from "../../components/FeedCard.js";
import { useFeed } from "../../hooks/useFeed.js";
import "../../styles/home.css";

/** The five stored statuses, in the order their plain-word chips are shown. */
const CHIP_STATUSES: readonly AdrStatus[] = [
  "proposed",
  "accepted",
  "deprecated",
  "superseded",
  "rejected",
];

export interface HomePageProps {
  /** Data source for the feed and the hero keyword search. */
  apiClient: ApiClient;
  /**
   * Fired with a decision id when a card is selected, so the parent navigates to
   * that decision's article (Req 2.6). Kept as a prop — rather than reaching into
   * `portalStore` — so HomePage stays unit-testable against the real backend
   * without the full App shell; the store wiring is task 8.1's responsibility.
   */
  onOpenDecision: (id: AdrId) => void;
  /**
   * Mount slot for the Topics rail (Req 3.3, task 5.3). Optional `ReactNode` so
   * the slot is an additive seam: task 5.3 builds `TopicsRail` and it is passed
   * in here (via task 8.1) with a one-line change, and this file never has to be
   * edited to accommodate it. Rendered as an empty placeholder when absent.
   */
  topicsRail?: ReactNode;
  /**
   * Mount slot for the "Needs your attention" digest (Req 5, task 5.5). Same
   * additive-seam contract as {@link topicsRail}: task 5.5 builds
   * `AttentionDigest` and it is dropped into this slot with a one-line change.
   */
  attentionDigest?: ReactNode;
  /**
   * Injectable "now" forwarded to each FeedCard so relative timestamps stay
   * deterministic in tests; defaults to the live clock inside FeedCard.
   */
  now?: Date;
}

/** Active hero-search state. `inactive` means no query has been submitted. */
type SearchState =
  | { kind: "inactive" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "active"; hits: SearchHit[] };

/**
 * Home decision feed (design.md "UI compositions" → HomePage; Req 2, 14).
 *
 * Composes the committed building blocks: the `["feed"]` query via `useFeed`
 * provides the full set of `FeedCard`s, which back both the browsing feed and —
 * joined by id to the existing keyword search's hits — the search results, so
 * results render in the identical feed-card presentation (Req 14.2) without a new
 * endpoint. Plain-word status chips (`STATUS_LABELS`) filter the feed client-side
 * (Req 2.4-2.5). Selecting a card calls `onOpenDecision` (Req 2.6). An inviting
 * empty state replaces a blank feed whenever a search or filter matches nothing
 * (Req 2.7).
 *
 * The Topics rail (5.3) and attention digest (5.5) are rendered as optional
 * `ReactNode` mount slots so those sibling tasks plug in additively without
 * editing this file or each other's code.
 */
export function HomePage({
  apiClient,
  onOpenDecision,
  topicsRail,
  attentionDigest,
  now,
}: HomePageProps) {
  const feed = useFeed(apiClient);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "inactive" });
  const [activeStatus, setActiveStatus] = useState<AdrStatus | null>(null);

  const cards = feed.data ?? [];

  // When a search is active, join hits to the full feed cards by id, preserving
  // the backend's ranking order (Req 14.2); an unmatched hit id is dropped.
  const searchedCards = useMemo<FeedCardModel[] | null>(() => {
    if (search.kind !== "active") return null;
    const byId = new Map(cards.map((c) => [c.id, c]));
    return search.hits
      .map((hit) => byId.get(hit.id))
      .filter((c): c is FeedCardModel => c !== undefined);
  }, [search, cards]);

  const baseCards = searchedCards ?? cards;
  const visibleCards = activeStatus
    ? baseCards.filter((c) => c.status === activeStatus)
    : baseCards;

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "") {
      // An empty query clears the active search and returns to the full feed.
      setSearch({ kind: "inactive" });
      return;
    }
    setSearch({ kind: "loading" });
    try {
      const result = await apiClient.search(trimmed);
      if (!result.ok) {
        setSearch({ kind: "error" });
        return;
      }
      setSearch({ kind: "active", hits: result.hits });
    } catch {
      setSearch({ kind: "error" });
    }
  }

  function toggleChip(status: AdrStatus) {
    setActiveStatus((prev) => (prev === status ? null : status));
  }

  function clearFilters() {
    setActiveStatus(null);
    setSearch({ kind: "inactive" });
    setQuery("");
  }

  const isFiltered = activeStatus !== null || search.kind === "active";

  return (
    <div className="home" data-testid="home-page">
      <section className="home__hero" aria-label="Search decisions">
        <h1 className="home__hero-title">Decisions</h1>
        <form className="home__search" data-testid="home-search-form" onSubmit={handleSearchSubmit}>
          <label className="home__search-label" htmlFor="home-search-input">
            Search decisions
          </label>
          <div className="home__search-row">
            <input
              id="home-search-input"
              data-testid="home-search-input"
              className="field__input home__search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search decisions by keyword…"
            />
            <button type="submit" className="btn btn--primary" data-testid="home-search-submit">
              Search
            </button>
          </div>
        </form>

        <div className="home__chips" role="group" aria-label="Filter by status">
          {CHIP_STATUSES.map((status) => {
            const isActive = activeStatus === status;
            const classes = ["home__chip", isActive ? "is-active" : null].filter(Boolean).join(" ");
            return (
              <button
                key={status}
                type="button"
                className={classes}
                data-testid={`home-chip-${status}`}
                aria-pressed={isActive}
                onClick={() => toggleChip(status)}
              >
                {STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>
      </section>

      <div className="home__layout">
        <main className="home__feed-column" aria-label="Decision feed">
          {search.kind === "error" ? (
            <div className="state state--error" data-testid="home-search-error">
              <p className="state__message">Search failed. Please try again.</p>
            </div>
          ) : null}

          {feed.isPending ? (
            <div className="state state--loading" data-testid="home-loading">
              <span className="state__spinner" aria-hidden="true" />
              <p className="state__message">Loading decisions…</p>
            </div>
          ) : feed.isError ? (
            <div className="state state--error" data-testid="home-error">
              <p className="state__title">Couldn’t load the feed.</p>
              <p className="state__message">Please try again in a moment.</p>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="state state--empty" data-testid="home-empty">
              {isFiltered ? (
                <>
                  <p className="state__title">No matching decisions.</p>
                  <p className="state__message">
                    Nothing here fits your current search or filter yet.
                  </p>
                  <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                    Clear search and filters
                  </button>
                </>
              ) : (
                <>
                  <p className="state__title">No decisions yet.</p>
                  <p className="state__message">
                    Decisions you capture will show up here as an easy-to-scan feed.
                  </p>
                </>
              )}
            </div>
          ) : (
            <ul className="home__feed" data-testid="home-feed">
              {visibleCards.map((card) => (
                <li key={card.id} className="home__feed-item">
                  <FeedCard
                    card={card}
                    onOpen={onOpenDecision}
                    now={now}
                    data-testid={`home-card-${card.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </main>

        <aside className="home__rail" aria-label="Highlights">
          {/*
           * Additive mount slots (see topicsRail / attentionDigest prop docs):
           * always rendered so the seam is stable; empty until tasks 5.5 / 5.3
           * pass their component in. Kept as one-line `{prop}` children so those
           * tasks never edit this file or each other's code.
           */}
          <div className="home__slot" data-slot="attention-digest" data-testid="home-attention-digest-slot">
            {attentionDigest}
          </div>
          <div className="home__slot" data-slot="topics-rail" data-testid="home-topics-rail-slot">
            {topicsRail}
          </div>
        </aside>
      </div>
    </div>
  );
}
