import { beforeEach, describe, expect, it } from "vitest";
import {
  type Aspect,
  type WorkspaceState,
  useWorkspaceStore,
} from "./workspaceStore.js";

/** Read the current store state (vanilla getState, no React render needed). */
function state(): WorkspaceState {
  return useWorkspaceStore.getState();
}

describe("workspaceStore", () => {
  // Each test starts from the documented initial state (Req 10.4 test isolation).
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
  });

  // Req 1.2/1.3/10.4: documented defaults — null selections, empty author,
  // "editor" aspect, and every visibility flag closed.
  it("starts with the documented initial state", () => {
    const s = state();
    expect(s.selectedFolder).toBeNull();
    expect(s.selectedAdrId).toBeNull();
    expect(s.authorName).toBe("");
    expect(s.activeAspect).toBe("editor");
    expect(s.comparisonOpen).toBe(false);
    expect(s.paletteOpen).toBe(false);
    expect(s.inspectorOpen).toBe(false);
  });

  // Req 1.4: selectFolder records the folder path.
  it("selectFolder records the selected folder path", () => {
    useWorkspaceStore.getState().selectFolder("docs/adr");
    expect(state().selectedFolder).toBe("docs/adr");
  });

  // Req 1.2/2.2/4.3: selecting an ADR records the id, forces the editor aspect,
  // and dismisses the palette.
  it("selectAdr sets the id, forces the editor aspect, and closes the palette", () => {
    const store = useWorkspaceStore.getState();
    // Arrange a non-default situation so the forcing is observable.
    store.setAspect("relations");
    store.setPaletteOpen(true);

    useWorkspaceStore.getState().selectAdr("ADR-0007");

    const s = state();
    expect(s.selectedAdrId).toBe("ADR-0007");
    expect(s.activeAspect).toBe("editor");
    expect(s.paletteOpen).toBe(false);
  });

  // Req 1.3: clearing selection drops the ADR id and resets the aspect to editor.
  it("clearSelection clears the ADR id and resets the aspect to editor", () => {
    const store = useWorkspaceStore.getState();
    store.selectAdr("ADR-0007");
    store.setAspect("history");

    useWorkspaceStore.getState().clearSelection();

    const s = state();
    expect(s.selectedAdrId).toBeNull();
    expect(s.activeAspect).toBe("editor");
  });

  // Req 3.x author input plumbing.
  it("setAuthorName records the author name", () => {
    useWorkspaceStore.getState().setAuthorName("Ada Lovelace");
    expect(state().authorName).toBe("Ada Lovelace");
  });

  // Req 2.1/2.3: setAspect switches the active aspect.
  it("setAspect switches the active aspect", () => {
    const aspects: Aspect[] = ["editor", "relations", "history", "similar"];
    for (const aspect of aspects) {
      useWorkspaceStore.getState().setAspect(aspect);
      expect(state().activeAspect).toBe(aspect);
    }
  });

  // Req 2.5: comparison is reachable with no selection.
  it("openCompare opens the overlay even with no ADR selected", () => {
    expect(state().selectedAdrId).toBeNull();
    useWorkspaceStore.getState().openCompare();
    const s = state();
    expect(s.comparisonOpen).toBe(true);
    // openCompare must not invent a selection.
    expect(s.selectedAdrId).toBeNull();
  });

  // Req 2.5 invariant: dismissing the comparison overlay never mutates selection.
  it("closeCompare closes the overlay and preserves the current selection", () => {
    const store = useWorkspaceStore.getState();
    store.selectAdr("ADR-0007");
    store.openCompare();

    useWorkspaceStore.getState().closeCompare();

    const s = state();
    expect(s.comparisonOpen).toBe(false);
    expect(s.selectedAdrId).toBe("ADR-0007");
  });

  // Req 4.1: opening the palette toggles its flag without touching selection.
  it("setPaletteOpen(true) opens the palette without changing selection", () => {
    useWorkspaceStore.getState().selectAdr("ADR-0007");
    useWorkspaceStore.getState().setPaletteOpen(true);
    const s = state();
    expect(s.paletteOpen).toBe(true);
    expect(s.selectedAdrId).toBe("ADR-0007");
  });

  // Req 4.6 invariant: dismissing the palette never mutates selectedAdrId.
  it("setPaletteOpen(false) closes the palette and preserves the current selection", () => {
    const store = useWorkspaceStore.getState();
    store.selectAdr("ADR-0007");
    store.setPaletteOpen(true);

    useWorkspaceStore.getState().setPaletteOpen(false);

    const s = state();
    expect(s.paletteOpen).toBe(false);
    expect(s.selectedAdrId).toBe("ADR-0007");
  });

  // Req 6.2: the inspector toggles open/closed.
  it("toggleInspector flips the inspector open flag", () => {
    expect(state().inspectorOpen).toBe(false);
    useWorkspaceStore.getState().toggleInspector();
    expect(state().inspectorOpen).toBe(true);
    useWorkspaceStore.getState().toggleInspector();
    expect(state().inspectorOpen).toBe(false);
  });

  // Req 10.4: reset restores the full initial state for test isolation.
  it("reset restores the full initial state", () => {
    const store = useWorkspaceStore.getState();
    store.selectFolder("docs/adr");
    store.selectAdr("ADR-0007");
    store.setAuthorName("Ada Lovelace");
    store.setAspect("similar");
    store.openCompare();
    store.setPaletteOpen(true);
    store.toggleInspector();

    useWorkspaceStore.getState().reset();

    const s = state();
    expect(s.selectedFolder).toBeNull();
    expect(s.selectedAdrId).toBeNull();
    expect(s.authorName).toBe("");
    expect(s.activeAspect).toBe("editor");
    expect(s.comparisonOpen).toBe(false);
    expect(s.paletteOpen).toBe(false);
    expect(s.inspectorOpen).toBe(false);
  });
});
