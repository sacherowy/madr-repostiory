import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { parseCanonicalOutcome, type AdrStatus } from "@adr/shared";
import { OptionCardsEditor, type OptionCardsValue } from "./OptionCardsEditor.js";

/**
 * OptionCardsEditor owns the option cards, the "Mark as chosen" action, and the
 * Decision Outcome field with its UI-only lock (Req 9.1-9.5). These assertions
 * are fully pure (no backend): the editor is prop-driven, so a small stateful
 * harness lifts chosen/outcome/status the way ComposePage (task 8.1/7.6) will.
 */

const TWO_OPTIONS: OptionCardsValue = {
  consideredOptions: "* PostgreSQL\n* MongoDB",
  prosAndConsOfTheOptions:
    "**PostgreSQL**\n* Good, because it scales with our data\n* Bad, because ops overhead\n\n**MongoDB**\n* Good, because it is flexible",
};

const ONE_OPTION_NO_PROS: OptionCardsValue = {
  consideredOptions: "* SQLite",
  prosAndConsOfTheOptions: "",
};

function Harness({
  initialStatus = "proposed",
  initialValue = TWO_OPTIONS,
  initialOutcome = "",
}: {
  initialStatus?: AdrStatus;
  initialValue?: OptionCardsValue;
  initialOutcome?: string;
}) {
  const [status, setStatus] = useState<AdrStatus>(initialStatus);
  const [value, setValue] = useState<OptionCardsValue>(initialValue);
  const [chosenOptionId, setChosenOptionId] = useState<string | undefined>(undefined);
  const [decisionOutcome, setDecisionOutcome] = useState(initialOutcome);

  return (
    <>
      <button type="button" data-testid="harness-set-decided" onClick={() => setStatus("accepted")}>
        decided
      </button>
      <OptionCardsEditor
        value={value}
        onChange={setValue}
        status={status}
        decisionOutcome={decisionOutcome}
        onDecisionOutcomeChange={setDecisionOutcome}
        chosenOptionId={chosenOptionId}
        onMarkChosen={setChosenOptionId}
      />
    </>
  );
}

function outcomeField(): HTMLTextAreaElement {
  return screen.getByTestId("compose-outcome-input") as HTMLTextAreaElement;
}

describe("OptionCardsEditor — option cards (Req 9.1)", () => {
  it("renders one card per considered option with its description, pros, and cons", () => {
    render(<Harness />);

    const card0 = screen.getByTestId("compose-option-card-0");
    const card1 = screen.getByTestId("compose-option-card-1");

    expect((within(card0).getByTestId("compose-option-desc-0") as HTMLInputElement).value).toBe("PostgreSQL");
    expect((within(card0).getByTestId("compose-option-pros-0") as HTMLTextAreaElement).value).toContain(
      "it scales with our data",
    );
    expect((within(card0).getByTestId("compose-option-cons-0") as HTMLTextAreaElement).value).toContain(
      "ops overhead",
    );
    expect((within(card1).getByTestId("compose-option-desc-1") as HTMLInputElement).value).toBe("MongoDB");

    // Each card offers a "Mark as chosen" action (Req 9.1).
    expect(within(card0).getByTestId("compose-option-mark-0")).toHaveTextContent(/mark as chosen/i);
    expect(within(card1).getByTestId("compose-option-mark-1")).toHaveTextContent(/mark as chosen/i);
  });
});

describe("OptionCardsEditor — Decision Outcome lock matrix (Req 9.3-9.4)", () => {
  it("locks the outcome while In discussion with no chosen option (Req 9.3)", () => {
    render(<Harness initialStatus="proposed" />);
    expect(outcomeField()).toBeDisabled();
  });

  it("leaves the outcome unlocked when the status is Decided (accepted) (Req 9.4)", () => {
    render(<Harness initialStatus="accepted" />);
    expect(outcomeField()).not.toBeDisabled();
  });

  it("leaves the outcome unlocked for other non-proposed statuses (Req 9.3 scope)", () => {
    render(<Harness initialStatus="superseded" />);
    expect(outcomeField()).not.toBeDisabled();
  });
});

describe("OptionCardsEditor — Mark as chosen prefill + unlock (Req 9.2, 9.4)", () => {
  it("prefills the canonical outcome that round-trips through parseCanonicalOutcome, and unlocks (Req 9.2, 9.4)", () => {
    render(<Harness initialStatus="proposed" />);

    // Locked before any choice.
    expect(outcomeField()).toBeDisabled();

    fireEvent.click(screen.getByTestId("compose-option-mark-0"));

    // Prefilled with the canonical phrasing derived from the chosen option (Req 9.2).
    const value = outcomeField().value;
    expect(value).toBe("Chosen option: PostgreSQL, because it scales with our data");
    expect(parseCanonicalOutcome(value)).toEqual({
      option: "PostgreSQL",
      because: "it scales with our data",
    });

    // Marking chosen unlocks the field (Req 9.4).
    expect(outcomeField()).not.toBeDisabled();
  });

  it("prefills without a because clause when the chosen option has no pros (still round-trips)", () => {
    render(<Harness initialStatus="proposed" initialValue={ONE_OPTION_NO_PROS} />);

    fireEvent.click(screen.getByTestId("compose-option-mark-0"));

    const value = outcomeField().value;
    expect(value).toBe("Chosen option: SQLite");
    expect(parseCanonicalOutcome(value)).toEqual({ option: "SQLite" });
    expect(outcomeField()).not.toBeDisabled();
  });

  it("marks the chosen option as chosen and lets the author switch the choice", () => {
    render(<Harness initialStatus="proposed" />);

    fireEvent.click(screen.getByTestId("compose-option-mark-0"));
    expect(screen.getByTestId("compose-option-mark-0")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("compose-option-mark-1")).toHaveAttribute("aria-pressed", "false");

    // Switching the choice re-prefills the outcome from the newly chosen option.
    fireEvent.click(screen.getByTestId("compose-option-mark-1"));
    expect(screen.getByTestId("compose-option-mark-1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("compose-option-mark-0")).toHaveAttribute("aria-pressed", "false");
    expect(outcomeField().value).toBe("Chosen option: MongoDB, because it is flexible");
  });
});

describe("OptionCardsEditor — unlock transitions (Req 9.4)", () => {
  it("unlocks the outcome when the status is switched to Decided while no option is chosen", () => {
    render(<Harness initialStatus="proposed" />);
    expect(outcomeField()).toBeDisabled();

    fireEvent.click(screen.getByTestId("harness-set-decided"));

    expect(outcomeField()).not.toBeDisabled();
  });

  it("keeps the outcome unlocked after a choice even if edited freely (Req 9.4)", () => {
    render(<Harness initialStatus="proposed" />);

    fireEvent.click(screen.getByTestId("compose-option-mark-0"));
    const field = outcomeField();
    expect(field).not.toBeDisabled();

    fireEvent.change(field, { target: { value: "Chosen option: PostgreSQL, because we edited this" } });
    expect(outcomeField().value).toBe("Chosen option: PostgreSQL, because we edited this");
    expect(outcomeField()).not.toBeDisabled();
  });
});

describe("OptionCardsEditor — option editing emits serialized options", () => {
  it("reports the serialized option markdown when an option is edited", () => {
    const onChange = vi.fn();
    const onMarkChosen = vi.fn();
    const onDecisionOutcomeChange = vi.fn();

    render(
      <OptionCardsEditor
        value={ONE_OPTION_NO_PROS}
        onChange={onChange}
        status="proposed"
        decisionOutcome=""
        onDecisionOutcomeChange={onDecisionOutcomeChange}
        chosenOptionId={undefined}
        onMarkChosen={onMarkChosen}
      />,
    );

    fireEvent.change(screen.getByTestId("compose-option-desc-0"), { target: { value: "DuckDB" } });

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls[onChange.mock.calls.length - 1][0] as OptionCardsValue;
    expect(last.consideredOptions).toBe("* DuckDB");
  });

  it("adds and removes option cards", () => {
    const onChange = vi.fn();

    render(
      <OptionCardsEditor
        value={ONE_OPTION_NO_PROS}
        onChange={onChange}
        status="proposed"
        decisionOutcome=""
        onDecisionOutcomeChange={vi.fn()}
        chosenOptionId={undefined}
        onMarkChosen={vi.fn()}
      />,
    );

    expect(screen.getByTestId("compose-option-card-0")).toBeInTheDocument();
    expect(screen.queryByTestId("compose-option-card-1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("compose-option-add"));
    expect(screen.getByTestId("compose-option-card-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("compose-option-remove-1"));
    expect(screen.queryByTestId("compose-option-card-1")).not.toBeInTheDocument();
  });
});
