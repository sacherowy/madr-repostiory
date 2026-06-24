import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { Aspect } from "../state/workspaceStore.js";
import { AspectSwitcher } from "./AspectSwitcher.js";

/** The migrated panel-tab hooks, in display order (Req 11.1, Hook Migration Map). */
const TESTIDS = [
  "panel-tab-editor",
  "panel-tab-relations",
  "panel-tab-history",
  "panel-tab-similarity",
] as const;

describe("AspectSwitcher", () => {
  // Req 2.1 + 11.1: exactly four controls carrying the migrated panel-tab-* hooks,
  // wrapped in a labeled tablist (Req 9.2, 9.3). No Comparison control (Req 2.5).
  it("renders the four migrated aspect controls inside a labeled tablist and no comparison control", () => {
    render(
      <AspectSwitcher activeAspect="editor" counts={{}} onSelectAspect={() => {}} />
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveAttribute("aria-label");

    for (const testid of TESTIDS) {
      const control = screen.getByTestId(testid);
      expect(control).toHaveAttribute("role", "tab");
    }

    // Req 2.5: comparison is an action elsewhere — never a control here.
    expect(screen.queryByTestId("panel-tab-comparison")).toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(4);
  });

  // Req 2.3: the active aspect is marked via aria-selected/aria-current and the
  // .tab--active class; the others are not.
  it("marks only the active aspect with aria-selected, aria-current, and tab--active", () => {
    render(
      <AspectSwitcher activeAspect="relations" counts={{}} onSelectAspect={() => {}} />
    );

    const active = screen.getByTestId("panel-tab-relations");
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active).toHaveAttribute("aria-current", "true");
    expect(active).toHaveClass("tab--active");

    const inactive = screen.getByTestId("panel-tab-editor");
    expect(inactive).toHaveAttribute("aria-selected", "false");
    expect(inactive).not.toHaveAttribute("aria-current");
    expect(inactive).not.toHaveClass("tab--active");
  });

  // Req 2.4: a count renders for a provided key and only for provided keys.
  it("displays a count for a provided key and not for absent keys", () => {
    render(
      <AspectSwitcher
        activeAspect="editor"
        counts={{ relations: 3 }}
        onSelectAspect={() => {}}
      />
    );

    // Relations key present -> its count is shown on the control.
    expect(screen.getByTestId("panel-tab-relations")).toHaveTextContent("3");

    // History and Similar keys absent -> no count text on those controls.
    expect(screen.getByTestId("panel-tab-history")).not.toHaveTextContent(/\d/);
    expect(screen.getByTestId("panel-tab-similarity")).not.toHaveTextContent(/\d/);
  });

  // Req 2.4: Edit never carries a count even if (defensively) one were present;
  // the contract excludes "editor" from counts, so Edit shows only its label.
  it("never shows a count on the Edit control", () => {
    render(
      <AspectSwitcher
        activeAspect="editor"
        counts={{ relations: 1, history: 2, similar: 4 }}
        onSelectAspect={() => {}}
      />
    );

    expect(screen.getByTestId("panel-tab-editor")).not.toHaveTextContent(/\d/);
  });

  // Req 2.4: a zero count is still a present key and is displayed.
  it("displays a zero count when the key is present with value 0", () => {
    render(
      <AspectSwitcher
        activeAspect="editor"
        counts={{ history: 0 }}
        onSelectAspect={() => {}}
      />
    );

    expect(screen.getByTestId("panel-tab-history")).toHaveTextContent("0");
  });

  // Req 2.3: activating a control reports the corresponding aspect.
  it("calls onSelectAspect with the activated aspect", () => {
    const cases: Array<[string, Aspect]> = [
      ["panel-tab-editor", "editor"],
      ["panel-tab-relations", "relations"],
      ["panel-tab-history", "history"],
      ["panel-tab-similarity", "similar"],
    ];

    for (const [testid, aspect] of cases) {
      const onSelectAspect = vi.fn();
      const { unmount } = render(
        <AspectSwitcher
          activeAspect="editor"
          counts={{}}
          onSelectAspect={onSelectAspect}
        />
      );
      screen.getByTestId(testid).click();
      expect(onSelectAspect).toHaveBeenCalledTimes(1);
      expect(onSelectAspect).toHaveBeenCalledWith(aspect);
      unmount();
    }
  });
});
