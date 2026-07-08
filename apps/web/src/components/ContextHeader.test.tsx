import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContextHeader } from "./ContextHeader.js";

function noop() {
  /* placeholder callback */
}

describe("ContextHeader", () => {
  // Req 3.1: the selected ADR is presented as an object — identifier as a monospace
  // id chip (MonoChip variant="id"), status as a StatusBadge, the title, and the
  // optional supporting metadata — using the existing design-system treatments.
  it("renders the id chip, status badge, title, and meta from props", () => {
    render(
      <ContextHeader
        adrId="ADR-0001"
        title="Adopt the morski design system"
        status="accepted"
        meta={<span data-testid="header-meta-content">2026-06-23 · alice</span>}
        onEdit={noop}
        onCompare={noop}
      />
    );

    const header = screen.getByTestId("context-header");
    const scoped = within(header);

    // Req 3.1 id chip via MonoChip (teal id treatment) carrying the id text.
    const idChip = header.querySelector(".mono-chip--id");
    expect(idChip).not.toBeNull();
    expect(idChip).toHaveTextContent("ADR-0001");

    // Req 3.1 status via StatusBadge — the known-status modifier class + label.
    const badge = header.querySelector(".badge");
    expect(badge).not.toBeNull();
    expect(badge).toHaveClass("badge--accepted");
    // Requirement 1.1: the status badge shows the plain-language label ("Decided").
    expect(badge).toHaveTextContent("Decided");

    // Req 3.1 title text.
    expect(scoped.getByText("Adopt the morski design system")).toBeInTheDocument();

    // Req 3.3 supporting metadata node renders inside the header.
    const meta = screen.getByTestId("header-meta-content");
    expect(meta).toHaveTextContent("2026-06-23 · alice");
    expect(header).toContainElement(meta);
  });

  // Req 3.1: an unknown status still renders verbatim via StatusBadge's fallback;
  // meta is optional and its absence does not break rendering.
  it("renders without meta and falls back to the raw status for unknown statuses", () => {
    render(
      <ContextHeader
        adrId="ADR-0042"
        title="No metadata here"
        status="draft"
        onEdit={noop}
        onCompare={noop}
      />
    );

    const header = screen.getByTestId("context-header");
    expect(header.querySelector(".mono-chip--id")).toHaveTextContent("ADR-0042");
    expect(header.querySelector(".badge")).toHaveTextContent("draft");
    expect(within(header).getByText("No metadata here")).toBeInTheDocument();
  });

  // Req 3.2: inline Edit and Compare controls are present in the header.
  it("exposes inline Edit and Compare controls", () => {
    render(
      <ContextHeader adrId="ADR-0001" title="t" status="accepted" onEdit={noop} onCompare={noop} />
    );

    const editControl = screen.getByTestId("context-edit");
    const compareControl = screen.getByTestId("context-compare");
    expect(editControl.tagName).toBe("BUTTON");
    expect(compareControl.tagName).toBe("BUTTON");
  });

  // Req 3.3 (3.2 wiring): activating Edit fires onEdit and only onEdit.
  it("invokes onEdit (and not onCompare) when Edit is clicked", () => {
    const onEdit = vi.fn();
    const onCompare = vi.fn();
    render(
      <ContextHeader
        adrId="ADR-0001"
        title="t"
        status="accepted"
        onEdit={onEdit}
        onCompare={onCompare}
      />
    );

    fireEvent.click(screen.getByTestId("context-edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onCompare).not.toHaveBeenCalled();
  });

  // Req 3.4 (3.2 wiring): activating Compare fires onCompare and only onCompare.
  it("invokes onCompare (and not onEdit) when Compare is clicked", () => {
    const onEdit = vi.fn();
    const onCompare = vi.fn();
    render(
      <ContextHeader
        adrId="ADR-0001"
        title="t"
        status="accepted"
        onEdit={onEdit}
        onCompare={onCompare}
      />
    );

    fireEvent.click(screen.getByTestId("context-compare"));
    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  // Req 9.3: the header region and its controls are identifiable by assistive
  // technology (accessible region label + clear, unambiguous button names that
  // name the ADR being acted on).
  it("labels the header region and its controls for assistive technology", () => {
    render(
      <ContextHeader
        adrId="ADR-0001"
        title="Adopt the morski design system"
        status="accepted"
        onEdit={noop}
        onCompare={noop}
      />
    );

    // An accessible region label that identifies the header.
    const region = screen.getByRole("region", { name: /ADR-0001/i });
    expect(region).toHaveAttribute("data-testid", "context-header");

    // Clear, scoped accessible names for the two controls.
    const editControl = screen.getByRole("button", { name: /edit/i });
    const compareControl = screen.getByRole("button", { name: /compare/i });
    expect(editControl).toHaveAttribute("data-testid", "context-edit");
    expect(compareControl).toHaveAttribute("data-testid", "context-compare");
    expect(editControl.getAttribute("aria-label")).toMatch(/ADR-0001/);
    expect(compareControl.getAttribute("aria-label")).toMatch(/ADR-0001/);
  });
});
