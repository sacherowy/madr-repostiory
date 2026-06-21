import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App.js";

describe("App", () => {
  it("renders the ADR Manager heading", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "ADR Manager" })).toBeInTheDocument();
  });

  it("tracks the author name and surfaces it in the editor panel", () => {
    render(<App />);

    const authorInput = screen.getByTestId("author-name-input");
    fireEvent.change(authorInput, { target: { value: "Ada Lovelace" } });

    expect(screen.getByTestId("panel-editor")).toHaveTextContent("Ada Lovelace");
  });

  it("selecting an ADR from the tree placeholder opens it in the editor panel", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-001" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));

    expect(screen.getByTestId("panel-editor")).toHaveTextContent("adr-001");
  });

  it("selecting an ADR from the search placeholder opens it in the editor panel", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("search-adr-id-input"), { target: { value: "adr-002" } });
    fireEvent.click(screen.getByTestId("select-adr-from-search-button"));

    expect(screen.getByTestId("panel-editor")).toHaveTextContent("adr-002");
  });

  it("switching to a non-editor tab with an ADR selected renders that panel with the ADR id", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-003" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));
    fireEvent.click(screen.getByTestId("panel-tab-relations"));

    expect(screen.getByTestId("panel-relations")).toHaveTextContent("adr-003");
  });

  it("switching to a non-editor tab with no ADR selected renders the empty placeholder", () => {
    render(<App />);

    fireEvent.click(screen.getByTestId("panel-tab-history"));

    expect(screen.getByTestId("panel-empty")).toBeInTheDocument();
  });

  it("selecting a new ADR while on a non-editor tab switches back to the editor panel", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-004" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));
    fireEvent.click(screen.getByTestId("panel-tab-relations"));
    expect(screen.getByTestId("panel-relations")).toHaveTextContent("adr-004");

    fireEvent.change(screen.getByTestId("search-adr-id-input"), { target: { value: "adr-005" } });
    fireEvent.click(screen.getByTestId("select-adr-from-search-button"));

    expect(screen.getByTestId("panel-editor")).toHaveTextContent("adr-005");
  });

  it("keeps the author name reflected in the editor panel across tab and ADR changes", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("author-name-input"), { target: { value: "Grace Hopper" } });
    fireEvent.change(screen.getByTestId("tree-adr-id-input"), { target: { value: "adr-006" } });
    fireEvent.click(screen.getByTestId("select-adr-from-tree-button"));
    fireEvent.click(screen.getByTestId("panel-tab-history"));
    fireEvent.click(screen.getByTestId("panel-tab-editor"));

    expect(screen.getByTestId("panel-editor")).toHaveTextContent("Grace Hopper");
    expect(screen.getByTestId("panel-editor")).toHaveTextContent("adr-006");
  });

  it("selecting a folder does not change the active panel or selected ADR", () => {
    render(<App />);

    fireEvent.change(screen.getByTestId("folder-path-input"), { target: { value: "docs/adr" } });
    fireEvent.click(screen.getByTestId("select-folder-button"));

    expect(screen.getByTestId("panel-editor")).toHaveTextContent("(new)");
  });
});
