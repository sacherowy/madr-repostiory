import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { relationLabel, type AdrRelation, type RelationType } from "@adr/shared";
import { RelationsEditor, type RelationTarget } from "./RelationsEditor.js";

/**
 * RelationsEditor tests (task 7.2 / Req 8.4, 1.2). PURE — no backend: the editor
 * is fed the current relations (`value`), the candidate target decisions
 * (`targets`, supplied from the feed by task 8.1), and reports changes through
 * `onChange`. Relation types are shown with the plain-language labels
 * (`relationLabel(..., "outgoing")`), never the raw stored enum.
 */
describe("RelationsEditor", () => {
  const targets: RelationTarget[] = [
    { id: "ADR-0002", title: "Use PostgreSQL" },
    { id: "ADR-0003", title: "Adopt event sourcing" },
  ];

  const ALL_TYPES: RelationType[] = [
    "supersedes",
    "superseded-by",
    "depends-on",
    "relates-to",
    "conflicts-with",
  ];

  it("offers every relation type under its plain-language label, never the raw enum (Req 1.2, 8.4)", () => {
    render(<RelationsEditor value={[]} targets={targets} onChange={vi.fn()} />);

    const typeSelect = screen.getByTestId("compose-relation-type");
    const labels = within(typeSelect)
      .getAllByRole("option")
      .map((o) => o.textContent);

    expect(labels).toEqual(ALL_TYPES.map((t) => relationLabel(t, "outgoing")));
    // Plain labels only — the stored enum keys are never shown as option text.
    for (const t of ALL_TYPES) {
      expect(labels).not.toContain(t);
    }
  });

  it("adds a relation (type + target decision) and reports it through onChange (Req 8.4)", () => {
    const onChange = vi.fn();
    render(<RelationsEditor value={[]} targets={targets} onChange={onChange} />);

    fireEvent.change(screen.getByTestId("compose-relation-type"), {
      target: { value: "supersedes" },
    });
    fireEvent.change(screen.getByTestId("compose-relation-target"), {
      target: { value: "ADR-0002" },
    });
    fireEvent.click(screen.getByTestId("compose-relation-add"));

    expect(onChange).toHaveBeenCalledWith([{ type: "supersedes", target: "ADR-0002" }]);
  });

  it("disables the add control until a target decision is chosen", () => {
    render(<RelationsEditor value={[]} targets={targets} onChange={vi.fn()} />);
    expect(screen.getByTestId("compose-relation-add")).toBeDisabled();

    fireEvent.change(screen.getByTestId("compose-relation-target"), {
      target: { value: "ADR-0003" },
    });
    expect(screen.getByTestId("compose-relation-add")).toBeEnabled();
  });

  it("lists existing relations with plain-language labels and the target's title (Req 1.2)", () => {
    const value: AdrRelation[] = [{ type: "depends-on", target: "ADR-0002" }];
    render(<RelationsEditor value={value} targets={targets} onChange={vi.fn()} />);

    const item = screen.getByTestId("compose-relation-item-0");
    // Plain-language relation label ("Builds on"), not the raw "depends-on".
    expect(within(item).getByText(relationLabel("depends-on", "outgoing"))).toBeInTheDocument();
    expect(within(item).queryByText("depends-on")).not.toBeInTheDocument();
    // The friendly target title is shown alongside the id.
    expect(within(item).getByText("Use PostgreSQL")).toBeInTheDocument();
  });

  it("removes a relation and reports the shortened list through onChange", () => {
    const onChange = vi.fn();
    const value: AdrRelation[] = [
      { type: "relates-to", target: "ADR-0002" },
      { type: "conflicts-with", target: "ADR-0003" },
    ];
    render(<RelationsEditor value={value} targets={targets} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("compose-relation-remove-0"));

    expect(onChange).toHaveBeenCalledWith([{ type: "conflicts-with", target: "ADR-0003" }]);
  });
});
