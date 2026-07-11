// Journey: DOM-level design-contract verification, retargeted to the portal shell
// (Req 12.1-12.4; behavior preserved through the portal, Req 15.2 / 16.4). Drives
// the real launched portal and asserts — purely through the rendered DOM and
// computed styles compared against the SAME token values the components consume
// (apps/web/src/styles/tokens.css), expressed as the `rgb()` the browser computes
// — that the portal surfaces honor the design contract that still applies:
//   (a) the TopNav shell renders,
//   (b) a genuine keyboard-focused control shows a visible focus outline (Req
//       7.4, 9.1, 12.2),
//   (c) a raised primary button carries a real Soft UI box-shadow (Req 7.1, 12.2),
//   (d) a FeedCard's StatusBadge shows the PLAIN-LANGUAGE label (never the raw
//       status key), its dot color matches the status token, and its accent is a
//       real element painted with the teal token (StatusBadge dot colors + card
//       accent — existing computed-style checks, preserved and retargeted),
//   (e) a RelationChip uses the monospace family, retargeted to the compose
//       RelationsEditor (the portal surface where RelationChip now renders).
//
// The deleted shell's checks (aspect switcher, command palette, inspector rail,
// context header) are dropped — those components no longer exist. No pixel-
// baseline snapshot oracle is introduced (no toHaveScreenshot/toMatchSnapshot)
// and no new dependency is added (Req 12.3). Runs offline in pre-provisioned
// Chromium (Req 12.4 / 16.3).

import { test, expect, type APIRequestContext } from "@playwright/test";

import { shot } from "../harness/helpers.js";

// Token values the components actually consume (apps/web/src/styles/tokens.css),
// expressed as the computed `rgb()` the browser resolves them to. These track
// the active "Backstage" theme's brand tokens.
//   --proposed: #2E77D0  → rgb(46, 119, 208)   (freshly created ADRs are "proposed")
//   --teal-500: #4BB8A5  → rgb(75, 184, 165)   (the feed-card accent treatment)
const PROPOSED_RGB = "rgb(46, 119, 208)";
const TEAL_500_RGB = "rgb(75, 184, 165)";

const AUTHOR = "E2E Author <e2e@example.com>";

/** A unique, hyphen-free word safe to embed in a title. */
function token(): string {
  return `zz${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Create an ADR via the proxied API; returns its id (status defaults to proposed). */
async function createAdr(request: APIRequestContext, title: string): Promise<string> {
  const res = await request.post("/api/adrs", {
    data: { title, folder: "decisions", author: AUTHOR },
  });
  expect(res.ok(), "createAdr should succeed").toBeTruthy();
  const adr = (await res.json()) as { id: string };
  return adr.id;
}

test("rendered DOM honors the portal shell and the design contract", async ({ page, request }) => {
  // Seed a proposed decision so a feed card (its StatusBadge + accent) and a
  // relation candidate both exist. A create-only ADR defaults to "proposed".
  const tag = token();
  const title = `Design ${tag}`;
  const id = await createAdr(request, title);

  await page.goto("/");

  // (a) The TopNav shell renders.
  await expect(page.getByTestId("top-nav")).toBeVisible();

  // (b) A keyboard-focused control shows a visible focus outline. Genuine
  // keyboard focus (Tab) triggers :focus-visible (a programmatic .focus() would
  // not), so the design's focus treatment applies. Anchor focus on a nav button
  // and Tab to the adjacent one — buttons carry the visible outline (inputs
  // deliberately suppress it), so the resulting outline is a real indicator:
  // non-`none` and non-zero-width (Req 7.4, 9.1, 12.2).
  await page.getByTestId("top-nav-home").focus();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).not.toHaveCSS("outline-style", "none");
  await expect(focused).not.toHaveCSS("outline-width", "0px");

  // (c) Soft UI depth: the New decision primary button carries a real, non-empty
  // box-shadow (the `--glow` layered with `--depth-raised`), proving the additive
  // depth treatment reaches the rendered DOM (Req 7.1, 12.2).
  const primaryBtn = page.getByTestId("top-nav-new");
  await expect(primaryBtn).toBeVisible();
  const boxShadow = await primaryBtn.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");
  expect(boxShadow.trim().length).toBeGreaterThan(0);

  // The seeded proposed decision's feed card.
  const card = page.getByTestId(`home-card-${id}`);
  await expect(card).toBeVisible();

  // (d-1) StatusBadge plain label: a proposed decision reads "In discussion",
  // never the raw status key (Req 1.1).
  const badge = card.locator(".badge--proposed");
  await expect(badge).toContainText("In discussion");
  await expect(badge).not.toContainText("proposed");

  // (d-2) StatusBadge dot color matches its status token: the `.badge__dot`
  // background computes to the --proposed token rgb.
  await expect(card.locator(".badge--proposed .badge__dot")).toHaveCSS(
    "background-color",
    PROPOSED_RGB,
  );

  // (d-3) The FeedCard accent is a real element (not a pseudo-element) painted
  // with the --teal-500 token.
  await expect(card.locator(".feed-card__accent")).toHaveCSS("background-color", TEAL_500_RGB);
  await shot(page, `design-system-feed-${tag}`);

  // (e) Relation chip uses the monospace family. Open the compose form and add a
  // relation to the seeded decision so a RelationChip (`.chip`, monospace per
  // base.css) renders in the RelationsEditor, then assert its computed
  // font-family contains the mono stack head.
  await page.getByTestId("top-nav-new").click();
  await expect(page.getByTestId("compose-relations-editor")).toBeVisible();
  await page.getByTestId("compose-relation-target").selectOption(id);
  await page.getByTestId("compose-relation-add").click();
  const chip = page.getByTestId("compose-relation-list").locator(".chip").first();
  await expect(chip).toBeVisible();
  const fontFamily = await chip.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fontFamily).toContain("JetBrains Mono");

  // Diagnostic only — never a pass/fail oracle.
  await shot(page, `design-system-chip-${tag}`);
});
