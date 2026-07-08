import { useMemo, type ReactNode } from "react";
import {
  PEOPLE_LABELS,
  resolveShortDescription,
  type AdrId,
  type ShortDescription,
} from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useDecision } from "../../hooks/useDecision.js";
import { FRIENDLY_SECTIONS } from "./sectionNames.js";
import "../../styles/article.css";

export interface ArticlePageProps {
  /** Data source: the decision, its relations, history, and similar decisions. */
  apiClient: ApiClient;
  /** The decision to present as an article. */
  adrId: AdrId;
  /**
   * Mount slot for the option compare cards (Req 6.4, task 6.2). Optional
   * `ReactNode` so the slot is an additive seam — the same pattern HomePage uses
   * for its `topicsRail` / `attentionDigest` slots: task 6.2 builds
   * `OptionCompareCards` and it is passed in here (via task 8.1) with a one-line
   * change, and this file never has to be edited to accommodate it. It is
   * rendered at the canonical "Considered Options" position so the compare cards
   * take the place of a raw options section (no duplication).
   */
  optionCompareCards?: ReactNode;
  /**
   * Mount slot for the context rail (relations / story / related reading — Req
   * 6.5, task 6.3). Same additive-seam contract as {@link optionCompareCards}:
   * task 6.3 builds `ContextRail` and it drops into this aside with a one-line
   * change. Rendered as an empty aside when absent.
   */
  contextRail?: ReactNode;
}

/**
 * One row of people under its plain-language label (Req 6.6). Rendered only when
 * the stored field is non-empty so empty roles don't clutter the article.
 */
function PeopleGroup({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="article__people-group">
      <span className="article__people-label">{label}</span>
      <span className="article__people-names">{names.join(", ")}</span>
    </div>
  );
}

/**
 * Decision article page core (design.md "UI compositions" → ArticlePage; Req 6).
 *
 * Presents a decision as an outcome-first article: a prominent title with the
 * plain-language status (`StatusBadge`), an outcome-first summary box stating the
 * decision's short description before any section content (Req 6.2), each
 * non-empty MADR section under a friendly name carrying the canonical MADR
 * heading as a subtle tag (Req 6.3), and the people under their plain-language
 * labels (`PEOPLE_LABELS`, Req 6.6).
 *
 * The short description is resolved through the shared `resolveShortDescription`
 * (layer 1 author `summary` wins, else deterministic derivation). This
 * single-decision view carries no repo-wide feed, so the title resolver is
 * minimal (returns `undefined`); a "Replaced by <title>" derivation then falls
 * back gracefully (12.3 → 12.4) without it.
 *
 * The option compare cards (task 6.2) and context rail (task 6.3) are rendered as
 * optional `ReactNode` mount slots so those sibling tasks plug in additively
 * without editing this file — the same seam pattern HomePage uses for its rails.
 * The Technical view toggle (task 6.4) is intentionally not built here.
 */
export function ArticlePage({ apiClient, adrId, optionCompareCards, contextRail }: ArticlePageProps) {
  const decision = useDecision(apiClient, adrId);
  const adr = decision.adr.data;

  const shortDescription = useMemo<ShortDescription | null>(() => {
    if (!adr) return null;
    return resolveShortDescription(
      {
        status: adr.status,
        summary: adr.summary,
        decisionOutcome: adr.decisionOutcome,
        consideredOptions: adr.consideredOptions,
        decisionDrivers: adr.decisionDrivers,
        contextAndProblemStatement: adr.contextAndProblemStatement,
        date: adr.date,
        relations: adr.relations ?? [],
      },
      // Minimal resolver for the single-decision article core: no repo-wide feed
      // is loaded here, so "Replaced by <title>" degrades to the 12.4 fallback.
      { resolveTitle: () => undefined }
    );
  }, [adr]);

  if (decision.adr.isPending) {
    return (
      <div className="article" data-testid="article-page">
        <div className="state state--loading" data-testid="article-loading">
          <span className="state__spinner" aria-hidden="true" />
          <p className="state__message">Loading decision…</p>
        </div>
      </div>
    );
  }

  if (decision.adr.isError || !adr || !shortDescription) {
    return (
      <div className="article" data-testid="article-page">
        <div className="state state--error" data-testid="article-error">
          <p className="state__title">We couldn’t open this decision.</p>
          <p className="state__message">It may have been moved or removed. Try heading back Home.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="article" data-testid="article-page">
      <div className="article__layout">
        <main className="article__main">
          <header className="article__header">
            <h1 className="article__title">{adr.title}</h1>
            <StatusBadge status={adr.status} data-testid="article-status" />
          </header>

          {/* Outcome-first summary box: leads before any section content (Req 6.2). */}
          <div className="article__summary" data-testid="article-summary">
            <span className="article__summary-lead">In one sentence:</span>
            <span className="article__summary-text">{shortDescription.text}</span>
          </div>

          {/* People under their plain-language labels (Req 6.6). */}
          <div className="article__people" data-testid="article-people">
            <PeopleGroup label={PEOPLE_LABELS.decisionMakers} names={adr.decisionMakers ?? []} />
            <PeopleGroup label={PEOPLE_LABELS.consulted} names={adr.consulted ?? []} />
            <PeopleGroup label={PEOPLE_LABELS.informed} names={adr.informed ?? []} />
          </div>

          {/* Each non-empty MADR section under its friendly name + canonical tag
              (Req 6.3), in canonical MADR order. The Considered Options position
              hosts the option-compare-cards slot instead of a raw section so task
              6.2's compare cards (Req 6.4) take its place without duplication. */}
          <div className="article__sections" data-testid="article-sections">
            {FRIENDLY_SECTIONS.map((section) => {
              if (section.key === "consideredOptions") {
                return (
                  <div
                    key={section.key}
                    className="article__slot"
                    data-slot="option-compare-cards"
                    data-testid="article-option-compare-slot"
                  >
                    {optionCompareCards}
                  </div>
                );
              }

              const body = adr[section.key];
              if (typeof body !== "string" || body.trim() === "") {
                return null;
              }

              return (
                <section
                  key={section.key}
                  className="article__section"
                  data-testid={`article-section-${section.key}`}
                >
                  <div className="article__section-head">
                    <h2 className="article__section-title">{section.friendlyName}</h2>
                    <span
                      className="article__section-tag"
                      data-testid={`article-section-tag-${section.key}`}
                    >
                      MADR: {section.canonicalHeading}
                    </span>
                  </div>
                  <p className="article__section-body">{body}</p>
                </section>
              );
            })}
          </div>
        </main>

        {/* Additive mount slot for the context rail (relations / story / related
            reading — task 6.3). Always rendered so the seam is stable; empty until
            task 6.3 passes its component in via task 8.1. */}
        <aside
          className="article__rail"
          data-slot="context-rail"
          data-testid="article-context-rail-slot"
          aria-label="Connected decisions and history"
        >
          {contextRail}
        </aside>
      </div>
    </div>
  );
}
