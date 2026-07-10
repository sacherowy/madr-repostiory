import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PEOPLE_LABELS } from "@adr/shared";
import { PeopleEditor, type PeopleValue } from "./PeopleEditor.js";

/**
 * PeopleEditor tests (task 7.2 / Req 8.4, 1.5). PURE — no backend: the editor
 * seeds its rows from a `value` (the three stored role arrays) and reports the
 * regrouped arrays through `onChange`. It reuses `compose/people.ts` helpers and
 * shows the plain-language people labels (`PEOPLE_LABELS`) instead of the raw
 * stored field/role names.
 */
describe("PeopleEditor", () => {
  const emptyValue: PeopleValue = { decisionMakers: [], consulted: [], informed: [] };

  function names() {
    return within(screen.getByTestId("compose-people-editor")).queryAllByRole("textbox");
  }

  function roleSelects() {
    return within(screen.getByTestId("compose-people-editor")).queryAllByRole("combobox");
  }

  it("presents the role choices using the plain-language people labels, never the raw stored names (Req 1.5, 8.4)", () => {
    render(
      <PeopleEditor
        value={{ decisionMakers: ["Ada"], consulted: [], informed: [] }}
        onChange={vi.fn()}
      />
    );

    const options = within(roleSelects()[0]).getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toEqual([
      PEOPLE_LABELS.decisionMakers, // "Decision owner"
      PEOPLE_LABELS.consulted, // "Input from"
      PEOPLE_LABELS.informed, // "Kept informed"
    ]);
    // The raw stored role names are never shown to the author.
    for (const label of labels) {
      expect(["Decision Maker", "Consulted", "Informed"]).not.toContain(label);
    }
  });

  it("seeds one editable row per stored person, in owner→input→informed order", () => {
    render(
      <PeopleEditor
        value={{ decisionMakers: ["Ada"], consulted: ["Grace"], informed: ["Linus"] }}
        onChange={vi.fn()}
      />
    );
    expect(names().map((input) => (input as HTMLInputElement).value)).toEqual([
      "Ada",
      "Grace",
      "Linus",
    ]);
  });

  it("adds a person and reports the new Decision owner through onChange (Req 8.4)", () => {
    const onChange = vi.fn();
    render(<PeopleEditor value={emptyValue} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("compose-person-add"));
    // The new row starts empty (default role = Decision owner); fill in a name.
    fireEvent.change(names()[0], { target: { value: "Ada Lovelace" } });

    expect(onChange).toHaveBeenLastCalledWith({
      decisionMakers: ["Ada Lovelace"],
      consulted: [],
      informed: [],
    });
  });

  it("removes a person and reports the shortened arrays through onChange", () => {
    const onChange = vi.fn();
    render(
      <PeopleEditor
        value={{ decisionMakers: ["Ada"], consulted: [], informed: [] }}
        onChange={onChange}
      />
    );

    fireEvent.click(within(screen.getByTestId("compose-people-editor")).getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenLastCalledWith({ decisionMakers: [], consulted: [], informed: [] });
  });

  it("re-labels a person by role and moves them between the stored arrays (Req 1.5)", () => {
    const onChange = vi.fn();
    render(
      <PeopleEditor
        value={{ decisionMakers: ["Ada"], consulted: [], informed: [] }}
        onChange={onChange}
      />
    );

    // Change the person's role to "Input from" (stored: consulted).
    fireEvent.change(roleSelects()[0], { target: { value: "Consulted" } });

    expect(onChange).toHaveBeenLastCalledWith({
      decisionMakers: [],
      consulted: ["Ada"],
      informed: [],
    });
  });
});
