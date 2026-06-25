// Journey: DOM-level design + contextual-navigation verification (Req 11.1, 12.1,
// 12.2, 12.3, 12.4). Drives the real launched UI through the SAME create/edit
// lifecycle and selectors the other journey specs use, then asserts — purely
// through the rendered DOM and computed styles — that the contextual shell and
// the design contract are honored:
//   (a) the contextual aspect switcher is ABSENT before an ADR is selected and
//       PRESENT (with human-readable labels) after one is selected (Req 2.2,
//       11.1, 12.1),
//   (b) the command palette opens via Cmd/Ctrl-K and moves focus to its query
//       field (Req 4.1, 12.1),
//   (c) the context header renders for the selected ADR (Req 3.1, 12.1),
//   (d) the inspector rail exposes ADR-scoped preview sections when opened with
//       an ADR selected (Req 6.1, 12.1),
//   (e) a status badge's dot color matches its status token, a relation chip
//       uses the monospace family, the ADR card accent is a real element
//       (existing computed-style design checks — preserved),
//   (f) a raised primary button carries a real Soft UI box-shadow (Req 7.1,
//       12.2), and
//   (g) a genuine keyboard-focused control shows a visible focus outline (Req
//       7.4, 9.1, 12.2).
//
// Verified via the rendered DOM and computed styles compared against the SAME
// token values the components consume (apps/web/src/styles/tokens.css), expressed
// as the `rgb()` the browser computes. No pixel-baseline snapshot oracle is
// introduced (no toHaveScreenshot/toMatchSnapshot) and no new dependency is added
// (Req 12.3). The suite runs offline in the pre-provisioned Chromium (Req 12.4).

import { test, expect } from "@playwright/test";

import { shot } from "../harness/helpers.js";

const AUTHOR = "E2E Author <e2e@example.com>";

// Token values the components actually consume (apps/web/src/styles/tokens.css),
// expressed as the computed `rgb()` the browser resolves them to.
//   --proposed: #5063CE  → rgb(80, 99, 206)   (freshly created ADRs are "proposed")
//   --teal-500: #0E9E8E  → rgb(14, 158, 142)  (the card accent treatment)
const PROPOSED_RGB = "rgb(80, 99, 206)";
const TEAL_500_RGB = "rgb(14, 158, 142)";

/** A unique, hyphen-free word safe to embed in a title. */
function token(): string {
  return `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

test("rendered DOM honors the contextual shell and the design contract", async ({ page }) => {
  const tag = token();
  const title = `Design ${tag}`;

  await page.goto("/");
  await page.getByTestId("author-name-input").fill(AUTHOR);

  // (a/pre) The contextual aspect switcher appears ONLY when an ADR is selected
  // (Req 2.2). On the initial browse/create screen no ADR is selected, so the
  // center shows the browse state and NONE of the aspect controls exist yet.
  await expect(page.getByTestId("center-browse")).toBeVisible();
  await expect(page.getByTestId("panel-tab-editor")).toHaveCount(0);
  await expect(page.getByTestId("panel-tab-relations")).toHaveCount(0);

  // (b) The command palette opens via Cmd/Ctrl-K (a global keyboard shortcut),
  // becomes visible, and moves focus into its query field (Req 4.1, 12.1).
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByTestId("command-palette")).toBeVisible();
  const paletteQuery = page.getByTestId("search-query-input");
  await expect(paletteQuery).toBeVisible();
  await expect(paletteQuery).toBeFocused();
  // Dismiss the palette so it does not overlay the subsequent create flow.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toHaveCount(0);

  // (g) A keyboard-focused control shows a visible focus outline. Genuine
  // keyboard focus (Tab) triggers :focus-visible (a programmatic .focus() would
  // not), so the design's focus treatment applies. Anchor focus on a control that
  // exists pre-selection (the command-palette-open button), Tab to the adjacent
  // control, and assert the resulting outline is a visible indicator — non-`none`
  // and non-zero-width (Req 7.4, 9.1, 12.2).
  await page.getByTestId("command-palette-open").focus();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).not.toHaveCSS("outline-style", "none");
  await expect(focused).not.toHaveCSS("outline-width", "0px");

  // Create a brand-new ADR through the default browse-state create editor. On
  // create the shell selects the new ADR (forcing the editor aspect), so the
  // center reshapes into the ADR-as-object region: context header + aspect
  // switcher + the editor aspect (which renders the StatusBadge, status defaults
  // to "proposed").
  await expect(page.getByTestId("adr-editor-create")).toBeVisible();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("create-button").click();
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await expect(page.getByTestId("title-input")).toHaveValue(title);

  // (c) The context header renders for the now-selected ADR (Req 3.1, 12.1).
  await expect(page.getByTestId("context-header")).toBeVisible();

  // (a/post) The contextual aspect switcher is now PRESENT, and its controls
  // render human-readable labels — not the raw internal state keys (Req 2.2,
  // 11.1, 12.1). These are the migrated `panel-tab-*` hooks from the old global
  // tab bar, now rendered by AspectSwitcher only while an ADR is selected. Edit
  // never carries a count (Req 2.4) so its text is exactly the label; the
  // countable aspects append a live-count badge (e.g. "Relations0"), so assert
  // the human label is contained — the point is the rendered label is a readable
  // word, never the raw state key ("relations"/"history"/"similar").
  await expect(page.getByTestId("panel-tab-editor")).toHaveText("Edit");
  await expect(page.getByTestId("panel-tab-relations")).toContainText("Relations");
  await expect(page.getByTestId("panel-tab-history")).toContainText("History");
  await expect(page.getByTestId("panel-tab-similarity")).toContainText("Similar");

  // (f) Soft UI depth: a raised primary button carries a real, non-empty
  // box-shadow (the `--depth-raised` elevation layered over `--glow`), proving
  // the additive depth treatment reaches the rendered DOM (Req 7.1, 12.2). The
  // edit-mode editor's "save" control is a `.btn--primary`.
  const editor = page.getByTestId("adr-editor-edit");
  const primaryBtn = editor.locator(".btn--primary").first();
  await expect(primaryBtn).toBeVisible();
  const boxShadow = await primaryBtn.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");
  expect(boxShadow.trim().length).toBeGreaterThan(0);

  // (e-a) Status badge color matches its status token. A freshly created ADR is
  // "proposed", so the editor's StatusBadge carries `badge--proposed`; its
  // `.badge__dot` background must compute to the --proposed token rgb.
  const proposedDot = editor.locator(".badge--proposed .badge__dot");
  await expect(proposedDot).toHaveCSS("background-color", PROPOSED_RGB);

  // (e-c) ADR card accent is present on a real element (not a pseudo-element).
  // The edit-mode editor is a `.card`, so its `.card__accent` child is directly
  // readable; its background is the --teal-500 token.
  const accent = editor.locator(".card__accent");
  await expect(accent).toHaveCSS("background-color", TEAL_500_RGB);

  // (e-b) Relation chip uses the monospace family. Add a relation through the
  // existing editor controls so a RelationChip (`.chip`, monospace per base.css)
  // renders, then assert its computed font-family contains the mono stack head.
  await page.getByTestId("relation-target-input").fill(`${tag}-target`);
  await page.getByTestId("add-relation-button").click();
  const chip = editor.locator(".chip").first();
  await expect(chip).toBeVisible();
  const fontFamily = await chip.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily).toContain("JetBrains Mono");

  // (d) Inspector rail previews. Open the collapsed-by-default inspector with an
  // ADR selected and assert the ADR-scoped preview SECTIONS appear (Req 6.1,
  // 12.1). Robust to offline-empty similarity: assert the section containers
  // exist, not specific result counts.
  await page.getByTestId("inspector-toggle").click();
  await expect(page.getByTestId("inspector-similar")).toBeVisible();
  await expect(page.getByTestId("inspector-history")).toBeVisible();

  // Diagnostic only — never a pass/fail oracle.
  await shot(page, `design-system-${tag}`);
});
