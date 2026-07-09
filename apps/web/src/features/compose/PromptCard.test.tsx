import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PromptCard } from "./PromptCard.js";

/**
 * PromptCard is a pure, presentational section card for the compose form
 * (Req 8.1): a friendly heading, helper text, an example placeholder, and the
 * canonical MADR heading shown as a subtle tag. No backend — these assertions
 * are fully pure.
 */
describe("PromptCard", () => {
  function renderCard(overrides?: Partial<React.ComponentProps<typeof PromptCard>>) {
    const onChange = vi.fn();
    render(
      <PromptCard
        sectionKey="contextAndProblemStatement"
        friendlyName="Why we needed to decide"
        canonicalHeading="Context and Problem Statement"
        helperText="Set the scene in a few plain sentences."
        placeholder="e.g. Our reporting data no longer scales…"
        value=""
        onChange={onChange}
        {...overrides}
      />
    );
    return { onChange };
  }

  it("renders the friendly heading, helper text, and example placeholder (Req 8.1)", () => {
    renderCard();

    const card = screen.getByTestId("compose-prompt-contextAndProblemStatement");
    const scoped = within(card);

    // Friendly heading is the visible section title.
    expect(scoped.getByText("Why we needed to decide")).toBeInTheDocument();
    // Helper text guides the author.
    expect(scoped.getByText("Set the scene in a few plain sentences.")).toBeInTheDocument();
    // The example is the field placeholder.
    const input = scoped.getByTestId("compose-prompt-input-contextAndProblemStatement");
    expect(input).toHaveAttribute("placeholder", "e.g. Our reporting data no longer scales…");
  });

  it("shows the canonical MADR heading as a subtle tag, verbatim (Req 8.1)", () => {
    renderCard();

    const tag = screen.getByTestId("compose-prompt-tag-contextAndProblemStatement");
    // Canonical heading kept verbatim; the proposal's "saved as MADR:" phrasing.
    expect(tag).toHaveTextContent("saved as MADR: Context and Problem Statement");
    expect(tag.textContent).toContain("Context and Problem Statement");
  });

  it("reflects its controlled value and reports edits through onChange", () => {
    const { onChange } = renderCard({ value: "existing text" });

    const input = screen.getByTestId("compose-prompt-input-contextAndProblemStatement");
    expect(input).toHaveValue("existing text");

    fireEvent.change(input, { target: { value: "new text" } });
    expect(onChange).toHaveBeenCalledWith("new text");
  });

  it("associates its label with the field for accessibility", () => {
    renderCard();
    // The friendly heading labels the textarea (accessible name).
    const input = screen.getByLabelText("Why we needed to decide");
    expect(input).toBe(screen.getByTestId("compose-prompt-input-contextAndProblemStatement"));
  });
});
