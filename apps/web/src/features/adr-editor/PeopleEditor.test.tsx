import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { PeopleEditor } from "./PeopleEditor.js";
import type { PersonRow } from "../compose/people.js";

afterEach(() => cleanup());

function makeRows(): PersonRow[] {
  return [
    { id: "row-1", name: "Alice", role: "Decision Maker" },
    { id: "row-2", name: "Bob", role: "Consulted" },
    { id: "row-3", name: "Carol", role: "Informed" },
  ];
}

describe("PeopleEditor", () => {
  describe("rendering rows", () => {
    it("renders one name input and one role select per row", () => {
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("person-name-input-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("person-name-input-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("person-name-input-row-3")).toBeInTheDocument();
      expect(screen.getByTestId("person-role-select-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("person-role-select-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("person-role-select-row-3")).toBeInTheDocument();
    });

    it("renders a remove button per row keyed by row id", () => {
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("remove-person-button-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("remove-person-button-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("remove-person-button-row-3")).toBeInTheDocument();
    });

    it("renders a single add-row control", () => {
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("add-person-button")).toBeInTheDocument();
    });

    it("populates the name input value from the row", () => {
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("person-name-input-row-2")).toHaveValue("Bob");
    });

    it("populates the role select value from the row", () => {
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("person-role-select-row-3")).toHaveValue("Informed");
    });

    it("restricts the role select options to the fixed set Decision Maker, Consulted, Informed", () => {
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      const select = screen.getByTestId("person-role-select-row-1") as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((option) => option.value);
      expect(optionValues).toEqual(["Decision Maker", "Consulted", "Informed"]);
    });

    it("renders no rows when given an empty rows array", () => {
      render(
        <PeopleEditor
          rows={[]}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(screen.queryByTestId(/person-name-input-/)).not.toBeInTheDocument();
      expect(screen.getByTestId("add-person-button")).toBeInTheDocument();
    });
  });

  describe("add row", () => {
    it("calls onAddRow when the add button is clicked", () => {
      const onAddRow = vi.fn();
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={onAddRow}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("add-person-button"));
      expect(onAddRow).toHaveBeenCalledTimes(1);
    });
  });

  describe("remove row", () => {
    it("calls onRemoveRow with the id of the targeted row, not its index", () => {
      const onRemoveRow = vi.fn();
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={onRemoveRow}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      // Remove the middle row (row-2) to prove identity-based removal.
      fireEvent.click(screen.getByTestId("remove-person-button-row-2"));

      expect(onRemoveRow).toHaveBeenCalledTimes(1);
      expect(onRemoveRow).toHaveBeenCalledWith("row-2");
    });

    it("does not call onRemoveRow with an unrelated row's id", () => {
      const onRemoveRow = vi.fn();
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={onRemoveRow}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("remove-person-button-row-1"));

      expect(onRemoveRow).toHaveBeenCalledWith("row-1");
      expect(onRemoveRow).not.toHaveBeenCalledWith("row-2");
      expect(onRemoveRow).not.toHaveBeenCalledWith("row-3");
    });
  });

  describe("field edits", () => {
    it("calls onNameChange with the correct row id and new value", () => {
      const onNameChange = vi.fn();
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={onNameChange}
          onRoleChange={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId("person-name-input-row-2"), {
        target: { value: "Bobby" },
      });

      expect(onNameChange).toHaveBeenCalledTimes(1);
      expect(onNameChange).toHaveBeenCalledWith("row-2", "Bobby");
    });

    it("calls onRoleChange with the correct row id and new role", () => {
      const onRoleChange = vi.fn();
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={onRoleChange}
        />
      );

      fireEvent.change(screen.getByTestId("person-role-select-row-3"), {
        target: { value: "Decision Maker" },
      });

      expect(onRoleChange).toHaveBeenCalledTimes(1);
      expect(onRoleChange).toHaveBeenCalledWith("row-3", "Decision Maker");
    });

    it("does not affect other rows' callbacks when editing one row", () => {
      const onNameChange = vi.fn();
      render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={onNameChange}
          onRoleChange={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId("person-name-input-row-1"), {
        target: { value: "Alicia" },
      });

      expect(onNameChange).toHaveBeenCalledWith("row-1", "Alicia");
      expect(onNameChange).not.toHaveBeenCalledWith("row-2", expect.anything());
      expect(onNameChange).not.toHaveBeenCalledWith("row-3", expect.anything());
    });
  });

  describe("CSS class structure", () => {
    it("outer wrapper has people-editor class", () => {
      const { container } = render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      expect(container.firstChild).toHaveClass("people-editor");
    });

    it("each row container has people-editor__row class", () => {
      const { container } = render(
        <PeopleEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onNameChange={vi.fn()}
          onRoleChange={vi.fn()}
        />
      );

      const rowElements = container.querySelectorAll(".people-editor__row");
      expect(rowElements).toHaveLength(3);
    });
  });
});
