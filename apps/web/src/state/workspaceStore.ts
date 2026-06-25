import { create } from "zustand";

/**
 * The four contextual aspects of a selected ADR. Comparison is deliberately not
 * an aspect — it is exposed as an action (Req 2.5).
 */
export type Aspect = "editor" | "relations" | "history" | "similar";

/** Cross-zone view-state held by the workspace store (Req 1.2, 1.3, 1.4, 10.4). */
export interface WorkspaceState {
  selectedFolder: string | null;
  selectedAdrId: string | null;
  authorName: string;
  activeAspect: Aspect;
  comparisonOpen: boolean;
  paletteOpen: boolean;
  inspectorOpen: boolean;
}

/**
 * Intent-named actions. Legal transitions are enforced inside each action so the
 * store can never reach an illegal combination (e.g. a selected ADR with a
 * non-editor default aspect, or a dismiss that silently drops the selection).
 */
export interface WorkspaceActions {
  selectFolder(path: string): void;
  /** Sets selectedAdrId, forces activeAspect="editor", and closes the palette. */
  selectAdr(id: string): void;
  /** Drops the selection and resets the aspect to "editor". */
  clearSelection(): void;
  setAuthorName(name: string): void;
  setAspect(aspect: Aspect): void;
  /** Opens the comparison overlay; valid with no ADR selected (Req 2.5). */
  openCompare(): void;
  /** Closes the comparison overlay; never mutates selectedAdrId. */
  closeCompare(): void;
  /** Toggles palette visibility; never mutates selectedAdrId on dismiss (Req 4.6). */
  setPaletteOpen(open: boolean): void;
  toggleInspector(): void;
  /** Restores the full initial state (test isolation hook, Req 10.4). */
  reset(): void;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

/** The documented initial view-state, reused by `reset()`. */
const INITIAL_STATE: WorkspaceState = {
  selectedFolder: null,
  selectedAdrId: null,
  authorName: "",
  activeAspect: "editor",
  comparisonOpen: false,
  paletteOpen: false,
  inspectorOpen: false,
};

/**
 * Typed Zustand store for cross-zone workspace view-state.
 *
 * Framework-light: this module imports only Zustand's `create` and holds no React
 * component imports, so it is unit-testable in isolation and importable by any
 * zone without prop-drilling.
 */
export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  ...INITIAL_STATE,

  selectFolder: (path) => set({ selectedFolder: path }),

  // Selecting an ADR forces the editor aspect and dismisses the palette so the
  // workspace lands on a coherent, editable view (Req 1.2, 2.2, 4.3).
  selectAdr: (id) =>
    set({ selectedAdrId: id, activeAspect: "editor", paletteOpen: false }),

  // Clearing returns to the browse/create state; reset the aspect so a later
  // selection does not inherit a stale, non-default aspect (Req 1.3).
  clearSelection: () => set({ selectedAdrId: null, activeAspect: "editor" }),

  setAuthorName: (name) => set({ authorName: name }),

  setAspect: (aspect) => set({ activeAspect: aspect }),

  openCompare: () => set({ comparisonOpen: true }),

  // Dismissing the overlay preserves the current selection (Req 2.5 invariant).
  closeCompare: () => set({ comparisonOpen: false }),

  // Palette dismiss must never touch selectedAdrId (Req 4.6 invariant).
  setPaletteOpen: (open) => set({ paletteOpen: open }),

  toggleInspector: () =>
    set((prev) => ({ inspectorOpen: !prev.inspectorOpen })),

  reset: () => set({ ...INITIAL_STATE }),
}));
