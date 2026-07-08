import { useMemo, type ReactNode } from "react";
import type { AdrId, FeedCard as FeedCardModel } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { FeedCard } from "../../components/FeedCard.js";
import { useFeed } from "../../hooks/useFeed.js";
import { usePortalStore } from "../../state/portalStore.js";
import { normalizePersonKey } from "../people/PeoplePage.js";
import "../../styles/home.css";

/** Every stored person name on a card, across all three role fields. */
function peopleOf(card: FeedCardModel): string[] {
  return [...card.decisionMakers, ...card.consulted, ...card.informed];
}

/**
 * The decisions that need the given author's attention (Req 5.1): those that are
 * In discussion (the plain-language label for the stored `proposed` status, so
 * matching is restricted to `proposed` cards) AND whose Decision owner / Input
 * from / Kept informed name the author.
 *
 * Names are compared through `normalizePersonKey` — the same case-insensitive,
 * whitespace-trimmed normalization the People directory groups by (Req 4.3) — so
 * the digest stays consistent with the rest of the portal and a differently-cased
 * or -spaced author name still matches. A blank/whitespace-only author name
 * normalizes to `""` and matches nothing, so callers must render the generic
 * prompt state instead of calling this (Req 5.2).
 */
export function filterAttentionCards(
  cards: readonly FeedCardModel[],
  authorName: string
): FeedCardModel[] {
  const key = normalizePersonKey(authorName);
  if (key === "") return [];
  return cards.filter(
    (card) =>
      card.status === "proposed" &&
      peopleOf(card).some((name) => normalizePersonKey(name) === key)
  );
}

export interface AttentionDigestProps {
  /** Data source for the feed (the digest is a client projection over it). */
  apiClient: ApiClient;
  /**
   * Fired with a decision id when a digest entry is selected, so the parent
   * navigates to that decision's article (Req 5.3). Kept as a prop — mirroring
   * HomePage/PeoplePage — so the digest stays unit-testable against the real
   * backend; the store wiring is task 8.1's responsibility.
   */
  onOpenDecision: (id: AdrId) => void;
  /** Injectable "now" forwarded to each FeedCard for deterministic timestamps. */
  now?: Date;
}

/**
 * "Needs your attention" digest (design.md "UI compositions" → AttentionDigest;
 * Req 5). Unlike the presentational rails, this component OWNS its matching input:
 * it reads the session author name straight from the portal store
 * (`usePortalStore(s => s.authorName)`), because the digest is spec'd to
 * personalize off that name rather than take it as a prop (task 8.1 wires only the
 * TopNav field ↔ store ↔ save; the matching lives here).
 *
 * While the author name is set it lists the In-discussion decisions naming the
 * author across any role, matched case-insensitively and whitespace-trimmed
 * (Req 5.1); each entry is a `FeedCard`, so selecting it navigates to the article
 * via `onOpenDecision` (Req 5.3). While the author name is blank it shows a
 * generic prompt state rather than attempting personalized matching (Req 5.2);
 * an author with no open decisions gets a distinct empty state.
 *
 * The digest is a pure client projection over the shared `["feed"]` query (via
 * `useFeed`), so it introduces no new endpoint. It fills HomePage's
 * `attentionDigest` mount slot additively (task 5.2 exposed the optional
 * `ReactNode` prop); it always renders its titled section so the Home layout is
 * stable whether or not the author name is set.
 */
export function AttentionDigest({ apiClient, onOpenDecision, now }: AttentionDigestProps) {
  const authorName = usePortalStore((state) => state.authorName);
  const feed = useFeed(apiClient);
  const cards = useMemo(() => feed.data ?? [], [feed.data]);

  const hasAuthor = authorName.trim() !== "";

  const matched = useMemo(
    () => (hasAuthor ? filterAttentionCards(cards, authorName) : []),
    [hasAuthor, cards, authorName]
  );

  let body: ReactNode;
  if (!hasAuthor) {
    // Req 5.2: no personalized matching without a name — a generic prompt only.
    body = (
      <div className="state state--empty" data-testid="attention-digest-prompt">
        <p className="state__message">
          Set your name in the top bar to see the decisions waiting on you.
        </p>
      </div>
    );
  } else if (feed.isPending || feed.isError) {
    // Quietly hold the section (heading only) until the feed resolves, rather
    // than flashing a misleading "nothing needs your attention" empty state.
    body = null;
  } else if (matched.length === 0) {
    // Author set but nothing open for them — distinct from the blank-author prompt.
    body = (
      <div className="state state--empty" data-testid="attention-digest-empty">
        <p className="state__message">Nothing needs your attention right now.</p>
      </div>
    );
  } else {
    body = (
      <ul className="attention-digest__list" data-testid="attention-digest-list">
        {matched.map((card) => (
          <li key={card.id} className="attention-digest__list-item">
            <FeedCard
              card={card}
              onOpen={onOpenDecision}
              now={now}
              data-testid={`attention-card-${card.id}`}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      className="attention-digest"
      aria-label="Needs your attention"
      data-testid="attention-digest"
    >
      <h2 className="attention-digest__title">Needs your attention</h2>
      {body}
    </section>
  );
}
