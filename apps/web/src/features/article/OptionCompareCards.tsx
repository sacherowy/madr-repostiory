import { useMemo } from "react";
import { parseCanonicalOutcome } from "@adr/shared";
// The pure option parser was relocated from the adr-editor feature into
// `compose` by task 7.1. This read-only article view reuses it as-is rather than
// duplicating the grammar. Do NOT fork a divergent parser.
import { parseOptions } from "../compose/options.js";
import "../../styles/article.css";

export interface OptionCompareCardsProps {
  /**
   * The decision's `Considered Options` MADR section (one `* {description}`
   * bullet per option). Matches `Adr.consideredOptions` so task 8.1 wires it
   * straight from `useDecision`'s `adr`.
   */
  consideredOptions: string;
  /**
   * The decision's `Pros and Cons of the Options` MADR section (one
   * `**{description}**` block with `* Good, because …` / `* Bad, because …`
   * bullets per option). Matches `Adr.prosAndConsOfTheOptions`.
   */
  prosAndConsOfTheOptions: string;
  /**
   * The decision's `Decision Outcome` MADR section. The chosen option is
   * derived from its canonical `Chosen option: X, because Y` phrasing via
   * `parseCanonicalOutcome` (Req 12.1). Matches `Adr.decisionOutcome`.
   */
  decisionOutcome: string;
}

/** App-wide normalization for matching names (mirrors `normalizePersonKey`). */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function nonBlankLines(value: string): string[] {
  return value.split("\n").filter((line) => line.trim() !== "");
}

/**
 * Considered options as compare cards with the chosen option highlighted
 * (design.md "UI compositions" → ArticlePage / OptionCompareCards; Req 6.4).
 *
 * Options are parsed with the shared `parseOptions` helper into `{ description,
 * pros, cons }` rows and rendered side by side. The chosen option is derived
 * from the canonical outcome phrasing via `parseCanonicalOutcome` (Req 12.1) and
 * matched against each card's description with the app's `.trim().toLowerCase()`
 * normalization. When the outcome is non-canonical (`parseCanonicalOutcome`
 * returns `null`) or names an option not among those considered, NO card is
 * highlighted — there is never a false highlight (Req 6.4 observable).
 *
 * Renders nothing when there are no considered options, so the article's
 * option-compare slot collapses ("where a decision has considered options").
 * This is a pure presentational component; task 8.1 mounts it into
 * ArticlePage's `optionCompareCards` slot with the decision's section data.
 */
export function OptionCompareCards({
  consideredOptions,
  prosAndConsOfTheOptions,
  decisionOutcome,
}: OptionCompareCardsProps) {
  const rows = useMemo(
    () => parseOptions(consideredOptions, prosAndConsOfTheOptions),
    [consideredOptions, prosAndConsOfTheOptions]
  );

  // null when the outcome is non-canonical → no card is highlighted (Req 6.4).
  const chosenKey = useMemo(() => {
    const parsed = parseCanonicalOutcome(decisionOutcome);
    return parsed ? normalize(parsed.option) : null;
  }, [decisionOutcome]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="option-compare" data-testid="option-compare-cards">
      <ol className="option-compare__grid">
        {rows.map((row) => {
          const isChosen = chosenKey !== null && normalize(row.description) === chosenKey;
          const pros = nonBlankLines(row.pros);
          const cons = nonBlankLines(row.cons);

          return (
            <li
              key={row.id}
              className={`option-compare__card${isChosen ? " option-compare__card--chosen" : ""}`}
              data-testid="option-compare-card"
              data-chosen={isChosen ? "true" : "false"}
              aria-current={isChosen ? "true" : undefined}
            >
              <div className="option-compare__card-head">
                <h3 className="option-compare__title">{row.description}</h3>
                {isChosen ? (
                  <span
                    className="option-compare__chosen-badge"
                    data-testid="option-compare-chosen-badge"
                  >
                    Chosen
                  </span>
                ) : null}
              </div>

              {pros.length > 0 ? (
                <div className="option-compare__pros" data-testid="option-compare-pros">
                  <span className="option-compare__list-label">In favor</span>
                  <ul className="option-compare__list">
                    {pros.map((line, index) => (
                      <li key={index} className="option-compare__list-item">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {cons.length > 0 ? (
                <div className="option-compare__cons" data-testid="option-compare-cons">
                  <span className="option-compare__list-label">Trade-offs</span>
                  <ul className="option-compare__list">
                    {cons.map((line, index) => (
                      <li key={index} className="option-compare__list-item">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
