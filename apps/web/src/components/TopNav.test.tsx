import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TopNav, type TopNavProps } from "./TopNav.js";

function noop() {
  /* placeholder callback */
}

function renderNav(overrides: Partial<TopNavProps> = {}) {
  const props: TopNavProps = {
    active: "home",
    onNavigateHome: noop,
    onNavigateTopics: noop,
    onNavigatePeople: noop,
    authorName: "",
    onAuthorNameChange: noop,
    onNewDecision: noop,
    ...overrides,
  };
  render(<TopNav {...props} />);
  return props;
}

describe("TopNav", () => {
  // Task 5.1: Home / Topics / People destinations, the author-name field, and a
  // New decision action are all present.
  it("renders Home, Topics, People destinations, the author-name field, and a New decision action", () => {
    renderNav();

    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Topics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "People" })).toBeInTheDocument();
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new decision/i })).toBeInTheDocument();
  });

  // The nav reflects which destination is active (aria-current="page").
  it.each([
    ["home", "Home"],
    ["topics", "Topics"],
    ["people", "People"],
  ] as const)("marks the %s destination as the active page", (active, label) => {
    renderNav({ active });

    const activeBtn = screen.getByRole("button", { name: label });
    expect(activeBtn).toHaveAttribute("aria-current", "page");

    for (const other of ["Home", "Topics", "People"].filter((l) => l !== label)) {
      expect(screen.getByRole("button", { name: other })).not.toHaveAttribute("aria-current", "page");
    }
  });

  it("marks no destination active when active is undefined (e.g. article/compose views)", () => {
    renderNav({ active: undefined });
    for (const label of ["Home", "Topics", "People"]) {
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute("aria-current", "page");
    }
  });

  it("fires the matching navigate callback (and only that one) for each destination", () => {
    const onNavigateHome = vi.fn();
    const onNavigateTopics = vi.fn();
    const onNavigatePeople = vi.fn();
    renderNav({ onNavigateHome, onNavigateTopics, onNavigatePeople });

    fireEvent.click(screen.getByRole("button", { name: "Topics" }));
    expect(onNavigateTopics).toHaveBeenCalledTimes(1);
    expect(onNavigateHome).not.toHaveBeenCalled();
    expect(onNavigatePeople).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "People" }));
    expect(onNavigatePeople).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it("reflects the authorName value and emits changes through onAuthorNameChange", () => {
    const onAuthorNameChange = vi.fn();
    renderNav({ authorName: "Ada", onAuthorNameChange });

    const input = screen.getByLabelText(/your name/i) as HTMLInputElement;
    expect(input.value).toBe("Ada");

    fireEvent.change(input, { target: { value: "Ada Lovelace" } });
    expect(onAuthorNameChange).toHaveBeenCalledTimes(1);
    expect(onAuthorNameChange).toHaveBeenCalledWith("Ada Lovelace");
  });

  it("fires onNewDecision when the New decision action is activated", () => {
    const onNewDecision = vi.fn();
    renderNav({ onNewDecision });

    fireEvent.click(screen.getByRole("button", { name: /new decision/i }));
    expect(onNewDecision).toHaveBeenCalledTimes(1);
  });

  it("is presentational: it renders standalone with no store/query provider", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderNav();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
