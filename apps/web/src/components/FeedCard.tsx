import type { KeyboardEvent } from "react";
import { PEOPLE_LABELS, type AdrId, type FeedCard as FeedCardModel } from "@adr/shared";
import { MonoChip } from "./MonoChip.js";
import { StatusBadge } from "./StatusBadge.js";
import { relativeTime } from "./relativeTime.js";
import "../styles/portal.css";

/** Shared base props for primitives that forward styling/test hooks. Mirrors the
 * shape used by StatusBadge/MonoChip so all primitives stay consistent. */
export interface BasePrimitiveProps {
  /** Optional extra class appended after the primitive's own design-system class. */
  className?: string;
  /** Optional test hook; primitives never invent testids, callers opt in. */
  "data-testid"?: string;
}

export interface FeedCardProps extends BasePrimitiveProps {
  /** The read-model projection to render (from `GET /api/feed`). */
  card: FeedCardModel;
  /** Fired when the card is activated (click or keyboard) — the parent navigates. */
  onOpen: (id: AdrId) => void;
  /**
   * Injectable "now" for the friendly relative timestamp so rendering stays
   * deterministic in tests; defaults to the live clock via `relativeTime`.
   */
  now?: Date;
}

/** Root-level decisions have `topic === ""`; show a friendly fallback label. */
function topicDisplay(topic: string): string {
  return topic.trim() === "" ? "General" : topic;
}

/**
 * One row of people under its plain-language label (Req 1.5). Rendered only
 * when the underlying stored field is non-empty so empty roles don't clutter
 * the card.
 */
function PeopleGroup({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="feed-card__people-group">
      <span className="feed-card__people-label">{label}</span>
      <span className="feed-card__people-names">{names.join(", ")}</span>
    </div>
  );
}

/**
 * Presentational decision card (design.md `FeedCard`, Req 2.3 + 1.5): title,
 * plain-language status (`StatusBadge`), the one-line short description, the
 * topic as a plain-language "Topic" chip (folders are shown as Topics, Req
 * 1.3), the people under their plain-language labels (`PEOPLE_LABELS`), and a
 * friendly relative timestamp derived from the stored date.
 *
 * Data-in, no fetching: it takes a fully-resolved `FeedCard` and an `onOpen`
 * callback and does no data access whatsoever, so the identical component backs
 * the Home feed, search results, topic/person lists, and the live compose
 * preview (design.md "Implementation Notes (web)" — keep FeedCard presentational
 * so preview reuse stays trivial). It composes the committed primitives
 * (`MonoChip`, `StatusBadge`) rather than re-implementing their markup.
 *
 * The whole card is one accessible activator (role="button", keyboard-operable
 * via Enter/Space) whose accessible name is the decision title, so selecting the
 * card navigates to the decision article (Req 2.6).
 */
export function FeedCard({ card, onOpen, now, className, "data-testid": dataTestId }: FeedCardProps) {
  const classes = ["feed-card", className].filter(Boolean).join(" ");

  const activate = () => onOpen(card.id);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      activate();
    }
  };

  return (
    <article
      className={classes}
      data-testid={dataTestId}
      role="button"
      tabIndex={0}
      aria-label={`Open decision: ${card.title}`}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      <span className="feed-card__accent" aria-hidden="true" />

      <div className="feed-card__body">
        <div className="feed-card__header">
          <MonoChip variant="id" value={card.id} />
          <StatusBadge status={card.status} />
        </div>

        <h3 className="feed-card__title">{card.title}</h3>

        <p className="feed-card__description">{card.shortDescription.text}</p>

        <div className="feed-card__footer">
          <span className="feed-card__topic" data-testid="feed-card-topic">
            <span className="feed-card__topic-label">Topic</span>
            <span className="feed-card__topic-value">{topicDisplay(card.topic)}</span>
          </span>

          <div className="feed-card__people" data-testid="feed-card-people">
            <PeopleGroup label={PEOPLE_LABELS.decisionMakers} names={card.decisionMakers} />
            <PeopleGroup label={PEOPLE_LABELS.consulted} names={card.consulted} />
            <PeopleGroup label={PEOPLE_LABELS.informed} names={card.informed} />
          </div>

          <time className="feed-card__time" dateTime={card.date} data-testid="feed-card-time">
            {relativeTime(card.date, now)}
          </time>
        </div>
      </div>
    </article>
  );
}
