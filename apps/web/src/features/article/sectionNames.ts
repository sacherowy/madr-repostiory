import { MADR_SECTIONS, type AdrSections } from "@adr/shared";

/**
 * Friendly section-name mapping for the decision article page (Req 6.3).
 *
 * Each MADR section is presented under a plain-language name while the canonical
 * MADR heading is kept verbatim so the article can show it as a subtle tag
 * alongside the friendly name (design.md "UI compositions" → ArticlePage:
 * "sections via friendly names + canonical MADR tag from MADR_SECTIONS").
 *
 * The friendly names follow the approved Concept A proposal
 * (docs/proposals/ux-navigation-redesign): "Why we needed to decide" ←
 * *Context and Problem Statement*, "What mattered to us" ← *Decision Drivers*,
 * "Options we looked at" ← *Considered Options*, "What this means for us" ←
 * *Consequences*. The remaining sections use the same plain-language voice.
 *
 * Pure constants only — this module maps stored MADR headings to display strings
 * and never rewrites the canonical values (they stay verbatim in the tag).
 */

/** Plain-language friendly name for each canonical MADR section (Req 6.3). */
const FRIENDLY_NAMES: Record<keyof AdrSections, string> = {
  contextAndProblemStatement: "Why we needed to decide",
  decisionDrivers: "What mattered to us",
  consideredOptions: "Options we looked at",
  decisionOutcome: "What we decided",
  consequences: "What this means for us",
  confirmation: "How we'll confirm it worked",
  prosAndConsOfTheOptions: "The options in detail",
  moreInformation: "More information",
};

/** A MADR section presented under a friendly name, keeping its canonical heading. */
export interface FriendlySection {
  key: keyof AdrSections;
  /** Plain-language name shown as the section heading (Req 6.3). */
  friendlyName: string;
  /** Canonical MADR heading, kept verbatim for the subtle tag (Req 6.3). */
  canonicalHeading: string;
}

/**
 * Every MADR section in canonical order, paired with its friendly name and the
 * canonical heading for the tag. Derived from {@link MADR_SECTIONS} so any change
 * to the canonical section set flows through here automatically.
 */
export const FRIENDLY_SECTIONS: readonly FriendlySection[] = MADR_SECTIONS.map((section) => ({
  key: section.key,
  friendlyName: FRIENDLY_NAMES[section.key],
  canonicalHeading: section.heading,
}));

/** Lookup helper: the friendly name for a given section key (Req 6.3). */
export function friendlySectionName(key: keyof AdrSections): string {
  return FRIENDLY_NAMES[key];
}
