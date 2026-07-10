import {
  resolveShortDescription,
  type AdrId,
  type DerivationInput,
  type FeedCard as FeedCardModel,
  type ShortDescriptionSource,
} from "@adr/shared";
import { FeedCard } from "../../components/FeedCard.js";
import "../../styles/compose.css";

/** Human labels for the short-description source ladder shown in the indicator. */
const SOURCE_LABELS: Record<ShortDescriptionSource, string> = {
  summary: "Your summary",
  derived: "Auto-derived",
};

/**
 * Placeholder id for the unsaved card. A live preview has no persisted id yet;
 * the id chip is presentational only (the preview card is never navigable), so a
 * stable placeholder keeps the card shape valid until 8.1 wires a real id in
 * edit mode.
 */
const DRAFT_ID_PLACEHOLDER = "New";

export interface PreviewRailProps {
  /** Draft title — the card title (Req 10.2). */
  title: string;
  /** Chosen topic path from TopicPicker ("" = root); shown as the card Topic (Req 10.2). */
  topic: string;
  /**
   * Layer-1 author-owned summary (frontmatter `summary`, Req 11). When non-blank
   * it sources the previewed short description (Req 10.3, source `"summary"`).
   */
  summary: string;
  /** People role arrays from PeopleEditor, shown under their plain labels (Req 10.2). */
  decisionMakers: string[];
  consulted: string[];
  informed: string[];
  /**
   * Layer-2 derivation inputs: everything {@link resolveShortDescription} needs
   * except `summary` (the controlled field above) — status, date, outcome,
   * options, drivers, context, and relations. Combined with `summary` to compute
   * the previewed short description via the SAME shared resolver the
   * feed/article/SummaryControl use, so what the author sees in the preview
   * matches what the feed will show (Req 10.1). `status` and `date` also populate
   * the card's status badge and timestamp.
   */
  derivation: Omit<DerivationInput, "summary">;
  /**
   * Feed-backed title resolver for the "Replaced by <title>" derivation (Req
   * 12.3): resolves a relation target id to its real feed title so the derived
   * preview text matches the feed. Injected by 8.1 (built from `useFeed`) to keep
   * this component pure/testable; absent → the derivation falls back gracefully
   * (12.3 → 12.4).
   */
  resolveTitle?: (id: AdrId) => string | undefined;
  /** Edit-mode decision id; absent selects the unsaved placeholder for the id chip. */
  id?: AdrId;
  /** Injectable "now" for the FeedCard's deterministic relative timestamp. */
  now?: Date;
}

/** The preview card is inert — a preview is not a navigable feed entry. */
function noop() {
  /* preview cards do not navigate */
}

/**
 * Live feed-card preview rail for the compose form (design.md "UI compositions"
 * → ComposePage: "PreviewRail renders a live FeedCard from unsaved form state via
 * `resolveShortDescription` with a feed-backed title resolver (10.1-10.3)"; File
 * Structure Plan → `features/compose/PreviewRail.tsx`; Req 10.1-10.3).
 *
 * Assembles a {@link FeedCardModel} DTO from the current unsaved draft and renders
 * it through the shared, presentational {@link FeedCard} — the very component the
 * Home feed uses — so the author sees the decision exactly as it will appear in
 * the feed (Req 10.1). The previewed short description is computed with the shared
 * {@link resolveShortDescription} (layer 1 author summary > layer 2 derivation),
 * the same resolver the feed, article, and SummaryControl use, so the preview
 * stays consistent with the feed; a feed-backed title resolver (injected by 8.1)
 * resolves relation-derived "Replaced by <title>" text to real feed titles, and
 * degrades gracefully when absent (12.3 → 12.4).
 *
 * Prop-driven and additive: every card-affecting field (title, status, short
 * description, topic, people — Req 10.2) arrives as a prop from ComposePage and
 * its sibling slots, so the "live update" is simply a re-render on prop change.
 * The source indicator surfaces which layer sources the previewed short
 * description — "Your summary" (authored) vs "Auto-derived" (derived) — mirroring
 * SummaryControl's ladder (Req 10.3).
 */
export function PreviewRail({
  title,
  topic,
  summary,
  decisionMakers,
  consulted,
  informed,
  derivation,
  resolveTitle,
  id,
  now,
}: PreviewRailProps) {
  // Same resolver as feed/article/SummaryControl → the preview matches the feed.
  const shortDescription = resolveShortDescription(
    { ...derivation, summary },
    { resolveTitle: resolveTitle ?? (() => undefined) },
  );

  const card: FeedCardModel = {
    id: id ?? DRAFT_ID_PLACEHOLDER,
    title,
    status: derivation.status,
    path: "",
    topic,
    date: derivation.date,
    decisionMakers,
    consulted,
    informed,
    shortDescription,
  };

  return (
    <section className="preview-rail" data-testid="compose-preview-rail" aria-label="Live feed preview">
      <div className="preview-rail__head">
        <h3 className="preview-rail__title">Live preview</h3>
        <p className="preview-rail__helper">How this decision will appear in the Home feed.</p>
      </div>

      <div
        className="preview-rail__source"
        data-testid="compose-preview-source"
        data-source={shortDescription.source}
      >
        <span className="preview-rail__source-label">Short description from</span>
        <span className="preview-rail__source-badge">{SOURCE_LABELS[shortDescription.source]}</span>
      </div>

      <FeedCard card={card} onOpen={noop} now={now} data-testid="compose-preview-card" />
    </section>
  );
}
