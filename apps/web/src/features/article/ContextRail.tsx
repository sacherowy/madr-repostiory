import { useMemo } from "react";
import {
  relationLabel,
  type AdrId,
  type CommitMeta,
  type RelationView,
  type SimilarityResult,
} from "@adr/shared";
import { SimilarityMeter } from "../../components/SimilarityMeter.js";
import { relativeTime } from "../../components/relativeTime.js";
import "../../styles/article.css";

export interface ContextRailProps {
  /**
   * Every relationship the decision participates in, from
   * `GET /api/adrs/:id/relations`. Each `type` is ALREADY reciprocal-resolved for
   * inbound views by core's relationGraphService, so the label is looked up with
   * the "outgoing" direction unconditionally (mirroring RelationChip) — never
   * double-flipped. Task 8.1 wires this straight from `useDecision`'s `relations`.
   */
  relations: RelationView[];
  /**
   * The decision's git "story" — newest-first commit metadata from
   * `GET /api/adrs/:id/history`. Rendered as plain-language "saved versions"
   * sentences (Req 1.4), never raw shas. Wired from `useDecision`'s `history`.
   */
  history: CommitMeta[];
  /**
   * Related decisions from `GET /api/adrs/:id/similar` — each an AdrSummary and a
   * score. Rendered as "Related reading" with the existing SimilarityMeter,
   * preserving similarity behavior (Req 15.2). Wired from `useDecision`'s `similar`.
   */
  similar: SimilarityResult[];
  /**
   * Optional resolver for a relation target's display title. A relation carries
   * only the target id; when this returns a title it is shown instead of the id.
   * Titles from {@link similar} are always consulted first, so 8.1 need not pass
   * this to get titles for targets that are also similar decisions.
   */
  resolveTitle?: (id: AdrId) => string | undefined;
  /** Optional navigation callback; relation/related entries link into the target. */
  onOpenDecision?: (id: AdrId) => void;
  /** Injectable reference instant so friendly relative dates are deterministic. */
  now?: Date;
}

/**
 * The decision article's context rail (design.md "UI compositions" → ContextRail;
 * Req 6.5, 1.4, 15.2). Renders three plain-language sections beside the article:
 *
 * - **Connected decisions** — each relation as a SENTENCE built from the shared
 *   `relationLabel` vocabulary (e.g. "Replaces <title>", "Builds on <id>"), not a
 *   raw enum or chip. The stored `type` is already reciprocal-resolved for inbound
 *   relations, so `relationLabel(type, "outgoing")` is used unconditionally (Impl
 *   Note 4.3) — the same rule RelationChip follows — to avoid double-flipping the
 *   supersedes pair.
 * - **Story** — the git history as friendly "saved a version <relative date>"
 *   sentences (Req 1.4), newest-first, reusing the `relativeTime` helper.
 * - **Related reading** — the existing similarity results, each with its target
 *   title and a reused `SimilarityMeter` showing the score (Req 15.2 preserves
 *   the similarity behavior; the meter is not rebuilt).
 *
 * Pure presentational component: it takes the resolved relations/history/similar
 * arrays as props (no fetching), so it is unit-testable without a backend and
 * task 8.1 mounts it into ArticlePage's `contextRail` slot with `useDecision`'s
 * results. Each section collapses independently when its data is empty.
 */
export function ContextRail({
  relations,
  history,
  similar,
  resolveTitle,
  onOpenDecision,
  now,
}: ContextRailProps) {
  // Titles for relation targets that are also similar decisions come for free;
  // an explicit `resolveTitle` (if provided) fills the rest; else the id shows.
  const titleOf = useMemo(() => {
    const fromSimilar = new Map<AdrId, string>();
    for (const { adr } of similar) {
      fromSimilar.set(adr.id, adr.title);
    }
    return (id: AdrId): string =>
      fromSimilar.get(id) ?? resolveTitle?.(id) ?? id;
  }, [similar, resolveTitle]);

  const hasRelations = relations.length > 0;
  const hasHistory = history.length > 0;
  const hasSimilar = similar.length > 0;

  return (
    <div className="context-rail" data-testid="context-rail">
      {hasRelations ? (
        <section className="context-rail__group" data-testid="context-rail-relations">
          <h2 className="context-rail__heading">Connected decisions</h2>
          <ul className="context-rail__list">
            {relations.map((relation) => {
              // Unconditional "outgoing" lookup: the type is already
              // reciprocal-resolved for inbound relations (Impl Note 4.3).
              const label = relationLabel(relation.type, "outgoing");
              const display = titleOf(relation.target);
              return (
                <li
                  key={`${relation.direction}-${relation.type}-${relation.target}`}
                  className="context-rail__item"
                  data-testid="context-rail-relation"
                >
                  {onOpenDecision ? (
                    <button
                      type="button"
                      className="context-rail__link"
                      onClick={() => onOpenDecision(relation.target)}
                    >
                      {label} {display}
                    </button>
                  ) : (
                    <span className="context-rail__sentence">
                      {label} {display}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {hasHistory ? (
        <section className="context-rail__group" data-testid="context-rail-story">
          <h2 className="context-rail__heading">Story</h2>
          <ul className="context-rail__list">
            {history.map((commit) => (
              <li
                key={commit.sha}
                className="context-rail__item"
                data-testid="context-rail-history"
              >
                <span className="context-rail__sentence">
                  {commit.author} saved a version {relativeTime(commit.date, now)}
                </span>
                {commit.message.trim() !== "" ? (
                  <span className="context-rail__detail">{commit.message}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasSimilar ? (
        <section className="context-rail__group" data-testid="context-rail-related-reading">
          <h2 className="context-rail__heading">Related reading</h2>
          <ul className="context-rail__list">
            {similar.map(({ adr, score }) => (
              <li
                key={adr.id}
                className="context-rail__item context-rail__related"
                data-testid="context-rail-related"
              >
                {onOpenDecision ? (
                  <button
                    type="button"
                    className="context-rail__link"
                    onClick={() => onOpenDecision(adr.id)}
                  >
                    {adr.title}
                  </button>
                ) : (
                  <span className="context-rail__sentence">{adr.title}</span>
                )}
                <SimilarityMeter score={score} data-testid="context-rail-similarity-meter" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
