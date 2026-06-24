// Journey: DOM-level design verification (Req 11.1, 13.1, 13.2, 13.3). Drives the
// real launched UI through the SAME create/edit lifecycle and selectors the other
// journey specs use, then asserts — purely through computed styles — that the
// rendered DOM honors the design contract:
//   (a) a status badge's dot color matches its status token,
//   (b) a relation chip uses the monospace family,
//   (c) the ADR card accent is a real, directly-assertable element,
//   (d) a keyboard-focused control shows a visible focus outline, and
//   (e) panel tabs render human-readable labels (not raw state keys).
//
// Verified via computed styles compared against the SAME token values the
// components consume (apps/web/src/styles/tokens.css), expressed as the `rgb()`
// the browser computes. No pixel-baseline snapshot oracle is introduced
// (no toHaveScreenshot/toMatchSnapshot) and no new dependency is added (Req 13.3).

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

test("rendered DOM honors the design contract via computed styles", async ({ page }) => {
  const tag = token();
  const title = `Design ${tag}`;

  await page.goto("/");
  await page.getByTestId("author-name-input").fill(AUTHOR);

  // (e) Panel tabs render human-readable labels, not the raw internal state key.
  // Asserted before any ADR exists — the tab bar is always present.
  await expect(page.getByTestId("panel-tab-editor")).toHaveText("Editor");
  await expect(page.getByTestId("panel-tab-relations")).toHaveText("Relations");

  // (d) A keyboard-focused control shows a visible focus outline. Genuine keyboard
  // focus (Tab) triggers :focus-visible (a programmatic .focus() would not), so
  // the design's focus treatment (a 2px teal-500 outline) applies. Anchor focus on
  // a stable control, then Tab to the adjacent control and assert the resulting
  // outline is a visible indicator — non-`none` and non-zero-width.
  await page.getByTestId("panel-tab-editor").focus();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).not.toHaveCSS("outline-style", "none");
  await expect(focused).not.toHaveCSS("outline-width", "0px");

  // Create a brand-new ADR through the default create-mode editor; the shell flips
  // into edit mode, which renders the StatusBadge (status defaults to "proposed").
  await expect(page.getByTestId("adr-editor-create")).toBeVisible();
  await page.getByTestId("title-input").fill(title);
  await page.getByTestId("create-button").click();
  await expect(page.getByTestId("adr-editor-edit")).toBeVisible();
  await expect(page.getByTestId("title-input")).toHaveValue(title);

  // (a) Status badge color matches its status token. A freshly created ADR is
  // "proposed", so the editor's StatusBadge carries `badge--proposed`; its
  // `.badge__dot` background must compute to the --proposed token rgb.
  const editor = page.getByTestId("adr-editor-edit");
  const proposedDot = editor.locator(".badge--proposed .badge__dot");
  await expect(proposedDot).toHaveCSS("background-color", PROPOSED_RGB);

  // (c) ADR card accent is present on a real element (not a pseudo-element). The
  // edit-mode editor is a `.card`, so its `.card__accent` child is directly
  // readable; its background is the --teal-500 token.
  const accent = editor.locator(".card__accent");
  await expect(accent).toHaveCSS("background-color", TEAL_500_RGB);

  // (b) Relation chip uses the monospace family. Add a relation through the
  // existing editor controls so a RelationChip (`.chip`, monospace per base.css)
  // renders, then assert its computed font-family contains the mono stack head.
  await page.getByTestId("relation-target-input").fill(`${tag}-target`);
  await page.getByTestId("add-relation-button").click();
  const chip = editor.locator(".chip").first();
  await expect(chip).toBeVisible();
  const fontFamily = await chip.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily).toContain("JetBrains Mono");

  // Diagnostic only — never a pass/fail oracle.
  await shot(page, `design-system-${tag}`);
});
