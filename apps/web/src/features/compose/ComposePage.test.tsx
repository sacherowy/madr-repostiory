import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { STATUS_LABELS } from "@adr/shared";
import { ComposePage } from "./ComposePage.js";

/**
 * ComposePage skeleton tests (task 7.1 / Req 8.1-8.3). These are PURE — the
 * skeleton owns local draft state and exposes an `onPublish` callback; the real
 * save wiring (createAdr/updateAdr) lands in task 7.6, so no backend is needed.
 *
 * Observable coverage:
 *  - publish gate: only title + context are required (8.3)
 *  - prompt-card structure with canonical MADR tags (8.1)
 *  - plain-word status segmented control (8.2)
 *  - additive mount slots for 7.2/7.3/7.4/7.5
 */
describe("ComposePage", () => {
  function typeTitle(value: string) {
    fireEvent.change(screen.getByTestId("compose-title-input"), { target: { value } });
  }

  function typeContext(value: string) {
    fireEvent.change(screen.getByTestId("compose-prompt-input-contextAndProblemStatement"), {
      target: { value },
    });
  }

  it("gates publish on title AND context only; Drivers/Options stay optional (Req 8.3)", () => {
    const onPublish = vi.fn();
    render(<ComposePage onPublish={onPublish} />);

    const publish = screen.getByTestId("compose-publish");

    // Nothing entered → gate closed.
    expect(publish).toBeDisabled();

    // Title alone is not enough (context still missing).
    typeTitle("Adopt the decision feed portal");
    expect(publish).toBeDisabled();

    // Context alone is not enough (title cleared).
    typeTitle("");
    typeContext("Stakeholders can't read the current IDE-style workspace.");
    expect(publish).toBeDisabled();

    // Title + context → gate opens, even with Drivers and Options left blank.
    typeTitle("Adopt the decision feed portal");
    expect(publish).toBeEnabled();

    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalledTimes(1);
    // Create publishes as "In discussion" (stored "proposed") by default (8.3).
    expect(onPublish.mock.calls[0][0]).toMatchObject({
      title: "Adopt the decision feed portal",
      status: "proposed",
      contextAndProblemStatement: "Stakeholders can't read the current IDE-style workspace.",
    });
  });

  it("treats whitespace-only title or context as empty (gate stays closed)", () => {
    render(<ComposePage />);
    const publish = screen.getByTestId("compose-publish");

    typeTitle("   ");
    typeContext("   ");
    expect(publish).toBeDisabled();
  });

  it("renders each owned MADR section as a prompt card carrying its canonical heading tag (Req 8.1)", () => {
    render(<ComposePage />);

    // Required context section is a prompt card with the canonical MADR tag.
    const context = screen.getByTestId("compose-prompt-contextAndProblemStatement");
    expect(within(context).getByText("Why we needed to decide")).toBeInTheDocument();
    expect(within(context).getByTestId("compose-prompt-tag-contextAndProblemStatement")).toHaveTextContent(
      "saved as MADR: Context and Problem Statement"
    );

    // An optional narrative section (Decision Drivers) is also a prompt card
    // with its own friendly heading + canonical tag.
    const drivers = screen.getByTestId("compose-prompt-decisionDrivers");
    expect(within(drivers).getByText("What mattered to us")).toBeInTheDocument();
    expect(within(drivers).getByTestId("compose-prompt-tag-decisionDrivers")).toHaveTextContent(
      "saved as MADR: Decision Drivers"
    );
  });

  it("presents status as a plain-word segmented control using STATUS_LABELS (Req 8.2)", () => {
    render(<ComposePage />);

    const segment = screen.getByTestId("compose-status-segment");
    const scoped = within(segment);

    // Every stored status is offered under its plain-word label, never the raw enum.
    for (const [stored, label] of Object.entries(STATUS_LABELS)) {
      const option = scoped.getByTestId(`compose-status-${stored}`);
      expect(option).toHaveTextContent(label);
      expect(option.textContent).not.toContain(stored);
    }

    // Default selection is "In discussion" (proposed).
    expect(scoped.getByTestId("compose-status-proposed")).toHaveAttribute("aria-pressed", "true");

    // Selecting another status updates the pressed state.
    fireEvent.click(scoped.getByTestId("compose-status-accepted"));
    expect(scoped.getByTestId("compose-status-accepted")).toHaveAttribute("aria-pressed", "true");
    expect(scoped.getByTestId("compose-status-proposed")).toHaveAttribute("aria-pressed", "false");
  });

  it("carries the chosen status into the published draft (Req 8.2 + 8.3)", () => {
    const onPublish = vi.fn();
    render(<ComposePage onPublish={onPublish} />);

    typeTitle("Retire the legacy tree explorer");
    typeContext("The tree explorer is being replaced by the decision feed.");
    fireEvent.click(within(screen.getByTestId("compose-status-segment")).getByTestId("compose-status-deprecated"));

    fireEvent.click(screen.getByTestId("compose-publish"));
    expect(onPublish.mock.calls[0][0]).toMatchObject({ status: "deprecated" });
  });

  it("lays out additive mount slots for topic/people/relations, options, summary, and preview (7.2-7.5 seams)", () => {
    render(
      <ComposePage
        topicPeopleRelations={<div data-testid="provided-tpr">tpr</div>}
        optionCards={<div data-testid="provided-options">options</div>}
        summaryControl={<div data-testid="provided-summary">summary</div>}
        previewRail={<div data-testid="provided-preview">preview</div>}
      />
    );

    expect(screen.getByTestId("compose-slot-topic-people-relations")).toContainElement(
      screen.getByTestId("provided-tpr")
    );
    expect(screen.getByTestId("compose-slot-option-cards")).toContainElement(
      screen.getByTestId("provided-options")
    );
    expect(screen.getByTestId("compose-slot-summary-control")).toContainElement(
      screen.getByTestId("provided-summary")
    );
    expect(screen.getByTestId("compose-slot-preview-rail")).toContainElement(
      screen.getByTestId("provided-preview")
    );
  });

  it("renders empty, stable mount slots when no slot content is provided", () => {
    render(<ComposePage />);
    expect(screen.getByTestId("compose-slot-topic-people-relations")).toBeEmptyDOMElement();
    expect(screen.getByTestId("compose-slot-option-cards")).toBeEmptyDOMElement();
    expect(screen.getByTestId("compose-slot-summary-control")).toBeEmptyDOMElement();
    expect(screen.getByTestId("compose-slot-preview-rail")).toBeEmptyDOMElement();
  });

  it("shows create-mode framing by default and edit-mode framing when an adrId is given", () => {
    const { rerender } = render(<ComposePage />);
    expect(screen.getByTestId("compose-page")).toBeInTheDocument();
    expect(screen.getByTestId("compose-publish")).toHaveTextContent("Publish");

    rerender(<ComposePage adrId="ADR-0007" />);
    expect(screen.getByTestId("compose-publish")).toHaveTextContent("Save");
  });

  it("seeds the form from initialDraft in edit mode (preload seam for 7.6)", () => {
    render(
      <ComposePage
        adrId="ADR-0007"
        initialDraft={{
          title: "Adopt the decision feed portal",
          status: "accepted",
          contextAndProblemStatement: "Existing shell is too technical.",
          decisionDrivers: "",
          consequences: "",
          confirmation: "",
          moreInformation: "",
        }}
      />
    );

    expect(screen.getByTestId("compose-title-input")).toHaveValue("Adopt the decision feed portal");
    expect(screen.getByTestId("compose-prompt-input-contextAndProblemStatement")).toHaveValue(
      "Existing shell is too technical."
    );
    expect(screen.getByTestId("compose-status-accepted")).toHaveAttribute("aria-pressed", "true");
    // Preloaded title + context → gate already open.
    expect(screen.getByTestId("compose-publish")).toBeEnabled();
  });
});
