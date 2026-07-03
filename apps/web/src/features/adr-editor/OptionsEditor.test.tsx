import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { OptionsEditor } from "./OptionsEditor.js";
import type { OptionRow } from "./options.js";

afterEach(() => cleanup());

function makeRows(): OptionRow[] {
  return [
    { id: "row-1", description: "Option A", pros: "Fast", cons: "Expensive" },
    { id: "row-2", description: "Option B", pros: "Cheap", cons: "Slow" },
    { id: "row-3", description: "Option C", pros: "Simple", cons: "Limited" },
  ];
}

describe("OptionsEditor", () => {
  describe("rendering rows", () => {
    it("renders one description input, pros textarea, and cons textarea per row", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("option-description-input-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("option-description-input-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("option-description-input-row-3")).toBeInTheDocument();
      expect(screen.getByTestId("option-pros-textarea-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("option-pros-textarea-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("option-pros-textarea-row-3")).toBeInTheDocument();
      expect(screen.getByTestId("option-cons-textarea-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("option-cons-textarea-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("option-cons-textarea-row-3")).toBeInTheDocument();
    });

    it("renders a remove button per row keyed by row id", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("remove-option-button-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("remove-option-button-row-2")).toBeInTheDocument();
      expect(screen.getByTestId("remove-option-button-row-3")).toBeInTheDocument();
    });

    it("renders a single add-row control", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("add-option-button")).toBeInTheDocument();
    });

    it("populates the description input value from the row", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("option-description-input-row-2")).toHaveValue("Option B");
    });

    it("populates the pros textarea value from the row", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("option-pros-textarea-row-3")).toHaveValue("Simple");
    });

    it("populates the cons textarea value from the row", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("option-cons-textarea-row-1")).toHaveValue("Expensive");
    });

    it("renders no rows when given an empty rows array", () => {
      render(
        <OptionsEditor
          rows={[]}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.queryByTestId(/option-description-input-/)).not.toBeInTheDocument();
      expect(screen.getByTestId("add-option-button")).toBeInTheDocument();
    });

    it("renders the description field as a text input, not a textarea", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      const descriptionField = screen.getByTestId("option-description-input-row-1");
      expect(descriptionField.tagName).toBe("INPUT");
      expect(descriptionField).toHaveAttribute("type", "text");
    });

    it("renders the pros and cons fields as textareas", () => {
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(screen.getByTestId("option-pros-textarea-row-1").tagName).toBe("TEXTAREA");
      expect(screen.getByTestId("option-cons-textarea-row-1").tagName).toBe("TEXTAREA");
    });
  });

  describe("add row", () => {
    it("calls onAddRow when the add button is clicked", () => {
      const onAddRow = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={onAddRow}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("add-option-button"));
      expect(onAddRow).toHaveBeenCalledTimes(1);
    });
  });

  describe("remove row", () => {
    it("calls onRemoveRow with the id of the targeted row, not its index", () => {
      const onRemoveRow = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={onRemoveRow}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      // Remove the middle row (row-2) to prove identity-based removal.
      fireEvent.click(screen.getByTestId("remove-option-button-row-2"));

      expect(onRemoveRow).toHaveBeenCalledTimes(1);
      expect(onRemoveRow).toHaveBeenCalledWith("row-2");
    });

    it("does not call onRemoveRow with an unrelated row's id", () => {
      const onRemoveRow = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={onRemoveRow}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("remove-option-button-row-1"));

      expect(onRemoveRow).toHaveBeenCalledWith("row-1");
      expect(onRemoveRow).not.toHaveBeenCalledWith("row-2");
      expect(onRemoveRow).not.toHaveBeenCalledWith("row-3");
    });
  });

  describe("field edits", () => {
    it("calls onDescriptionChange with the correct row id and new value", () => {
      const onDescriptionChange = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={onDescriptionChange}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId("option-description-input-row-2"), {
        target: { value: "Option B revised" },
      });

      expect(onDescriptionChange).toHaveBeenCalledTimes(1);
      expect(onDescriptionChange).toHaveBeenCalledWith("row-2", "Option B revised");
    });

    it("calls onProsChange with the correct row id and new value", () => {
      const onProsChange = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={onProsChange}
          onConsChange={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId("option-pros-textarea-row-3"), {
        target: { value: "Simple\nElegant" },
      });

      expect(onProsChange).toHaveBeenCalledTimes(1);
      expect(onProsChange).toHaveBeenCalledWith("row-3", "Simple\nElegant");
    });

    it("calls onConsChange with the correct row id and new value", () => {
      const onConsChange = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={onConsChange}
        />
      );

      fireEvent.change(screen.getByTestId("option-cons-textarea-row-1"), {
        target: { value: "Expensive\nSlow to deploy" },
      });

      expect(onConsChange).toHaveBeenCalledTimes(1);
      expect(onConsChange).toHaveBeenCalledWith("row-1", "Expensive\nSlow to deploy");
    });

    it("does not affect other rows' callbacks when editing one row", () => {
      const onDescriptionChange = vi.fn();
      render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={onDescriptionChange}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      fireEvent.change(screen.getByTestId("option-description-input-row-1"), {
        target: { value: "Option A revised" },
      });

      expect(onDescriptionChange).toHaveBeenCalledWith("row-1", "Option A revised");
      expect(onDescriptionChange).not.toHaveBeenCalledWith("row-2", expect.anything());
      expect(onDescriptionChange).not.toHaveBeenCalledWith("row-3", expect.anything());
    });
  });

  describe("CSS class structure", () => {
    it("outer wrapper has options-editor class", () => {
      const { container } = render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      expect(container.firstChild).toHaveClass("options-editor");
    });

    it("each row container has options-editor__row class", () => {
      const { container } = render(
        <OptionsEditor
          rows={makeRows()}
          onAddRow={vi.fn()}
          onRemoveRow={vi.fn()}
          onDescriptionChange={vi.fn()}
          onProsChange={vi.fn()}
          onConsChange={vi.fn()}
        />
      );

      const rowElements = container.querySelectorAll(".options-editor__row");
      expect(rowElements).toHaveLength(3);
    });
  });
});
