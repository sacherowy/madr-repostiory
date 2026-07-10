import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { OptionCompareCards } from "./OptionCompareCards.js";

/**
 * Structured option markdown (the grammar the web options editor serializes and
 * `parseOptions` reads): one `* {description}` bullet per option in
 * `consideredOptions`, and one `**{description}**` block with `* Good, because …`
 * / `* Bad, because …` bullets per option in `prosAndConsOfTheOptions`.
 */
const CONSIDERED_OPTIONS = ["* PostgreSQL", "* MongoDB", "* DynamoDB"].join("\n");

const PROS_AND_CONS = [
  "**PostgreSQL**",
  "* Good, because it fits relational reporting",
  "* Bad, because it needs schema migrations",
  "",
  "**MongoDB**",
  "* Good, because it is schema-flexible",
  "* Bad, because reporting joins are harder",
  "",
  "**DynamoDB**",
  "* Good, because it scales operationally",
].join("\n");

afterEach(() => {
  cleanup();
});

function cards() {
  return screen.getAllByTestId("option-compare-card");
}

describe("OptionCompareCards", () => {
  // Observable (task 6.2 / Req 6.4): each considered option renders as a compare
  // card carrying its description, pros, and cons.
  it("renders each considered option as a compare card with its pros and cons", () => {
    render(
      <OptionCompareCards
        consideredOptions={CONSIDERED_OPTIONS}
        prosAndConsOfTheOptions={PROS_AND_CONS}
        decisionOutcome={'Chosen option: "PostgreSQL", because it fits reporting.'}
      />
    );

    const rendered = cards();
    expect(rendered).toHaveLength(3);

    const postgres = rendered[0];
    expect(within(postgres).getByText("PostgreSQL")).toBeInTheDocument();
    expect(postgres).toHaveTextContent("it fits relational reporting");
    expect(postgres).toHaveTextContent("it needs schema migrations");

    expect(rendered[1]).toHaveTextContent("MongoDB");
    expect(rendered[2]).toHaveTextContent("DynamoDB");
  });

  // Observable (task 6.2 / Req 6.4 + 12.1): the option named by the canonical
  // outcome ("Chosen option: X") is the one visually highlighted — and only it.
  it("highlights only the card matching the canonical chosen outcome", () => {
    render(
      <OptionCompareCards
        consideredOptions={CONSIDERED_OPTIONS}
        prosAndConsOfTheOptions={PROS_AND_CONS}
        decisionOutcome={'Chosen option: "PostgreSQL", because our reporting needs relational queries.'}
      />
    );

    const rendered = cards();
    const chosen = rendered.filter((card) => card.getAttribute("data-chosen") === "true");

    // Exactly one card is highlighted, and it is the PostgreSQL card.
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toHaveTextContent("PostgreSQL");
    expect(within(chosen[0]).getByTestId("option-compare-chosen-badge")).toBeInTheDocument();

    // The other cards are not highlighted.
    expect(rendered[1].getAttribute("data-chosen")).toBe("false");
    expect(rendered[2].getAttribute("data-chosen")).toBe("false");
  });

  // Matching is case-insensitive and whitespace-tolerant, consistent with the
  // app's `.trim().toLowerCase()` normalization.
  it("matches the chosen option case-insensitively and trimmed", () => {
    render(
      <OptionCompareCards
        consideredOptions={CONSIDERED_OPTIONS}
        prosAndConsOfTheOptions={PROS_AND_CONS}
        decisionOutcome={"Chosen option:   postgresql  , because it fits."}
      />
    );

    const chosen = cards().filter((card) => card.getAttribute("data-chosen") === "true");
    expect(chosen).toHaveLength(1);
    expect(chosen[0]).toHaveTextContent("PostgreSQL");
  });

  // Observable (task 6.2 / Req 6.4): a non-canonical outcome (no "Chosen option:"
  // phrasing) yields NO highlight — no card is falsely marked chosen.
  it("highlights no card when the outcome is not canonical (no false highlight)", () => {
    render(
      <OptionCompareCards
        consideredOptions={CONSIDERED_OPTIONS}
        prosAndConsOfTheOptions={PROS_AND_CONS}
        decisionOutcome={"We will revisit this next quarter once traffic data lands."}
      />
    );

    const rendered = cards();
    expect(rendered).toHaveLength(3);
    expect(rendered.every((card) => card.getAttribute("data-chosen") === "false")).toBe(true);
    expect(screen.queryByTestId("option-compare-chosen-badge")).not.toBeInTheDocument();
  });

  // Also no false highlight when the chosen option names something not among the
  // considered options.
  it("highlights no card when the chosen option is not among the considered options", () => {
    render(
      <OptionCompareCards
        consideredOptions={CONSIDERED_OPTIONS}
        prosAndConsOfTheOptions={PROS_AND_CONS}
        decisionOutcome={'Chosen option: "Cassandra", because it was already in use elsewhere.'}
      />
    );

    expect(cards().every((card) => card.getAttribute("data-chosen") === "false")).toBe(true);
  });

  // When there are no considered options, the component renders nothing so the
  // article slot collapses (Req 6.4 applies only "where a decision has options").
  it("renders nothing when there are no considered options", () => {
    const { container } = render(
      <OptionCompareCards
        consideredOptions=""
        prosAndConsOfTheOptions=""
        decisionOutcome={'Chosen option: "PostgreSQL", because it fits.'}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("option-compare-cards")).not.toBeInTheDocument();
  });
});
