import type { AdrSections, MadrSectionMeta } from "@adr/shared";
import { MADR_SECTIONS } from "@adr/shared";

/**
 * The lossless translation boundary between a flat ADR body string and the
 * 8 discrete MADR section fields plus a catch-all `additionalContent` field.
 *
 * `splitSections` and `joinSections` are pure functions with no knowledge of
 * frontmatter, titles, or git -- they operate purely on the body string
 * `parse.ts` hands them after title-line extraction.
 */

interface HeadingMatch {
  /** Index of the heading line within the original `body` lines array. */
  lineIndex: number;
  /** The MADR_SECTIONS entry this heading matches, if any (first-match-wins). */
  meta: MadrSectionMeta | undefined;
  /** True if this is the first occurrence of the reserved catch-all heading. */
  isAdditionalContentHeading: boolean;
}

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;

/**
 * The reserved heading `joinSections` wraps `additionalContent` in, and
 * `splitSections` recognizes, to disambiguate the catch-all field's content
 * from trailing content of the last canonical section ("More Information")
 * on re-read. Level 2, exact text, deliberately not one of the 8
 * `MADR_SECTIONS` entries.
 */
const ADDITIONAL_CONTENT_HEADING_LEVEL = 2;
const ADDITIONAL_CONTENT_HEADING_TEXT = "Additional Content";
const ADDITIONAL_CONTENT_HEADING = `${"#".repeat(ADDITIONAL_CONTENT_HEADING_LEVEL)} ${ADDITIONAL_CONTENT_HEADING_TEXT}`;

/**
 * Scans `body` line by line for ATX heading lines and maps each one that
 * exactly matches an unconsumed `MADR_SECTIONS` entry (heading text AND
 * level) onto that section's field. The first occurrence of the reserved
 * `## Additional Content` heading is matched the same way, except its
 * (heading-stripped) content is routed to `additionalContent` instead of a
 * section field. Everything else -- non-matching headings, duplicate
 * occurrences of an already-matched heading (canonical or reserved), and any
 * content preceding the first heading -- is appended in original document
 * order to `additionalContent`. Never throws.
 */
export function splitSections(body: string): { sections: AdrSections; additionalContent: string } {
  const sections = createEmptySections();

  const lines = body.split("\n");
  const headingMatches: HeadingMatch[] = [];
  const matchedKeys = new Set<keyof AdrSections>();
  let matchedAdditionalContentHeading = false;

  lines.forEach((line, lineIndex) => {
    const match = HEADING_PATTERN.exec(line);
    if (!match) {
      return;
    }

    const level = match[1].length;
    const text = match[2].trim();

    const meta = MADR_SECTIONS.find(
      (candidate) => candidate.heading === text && candidate.level === level && !matchedKeys.has(candidate.key),
    );

    if (meta) {
      matchedKeys.add(meta.key);
      headingMatches.push({ lineIndex, meta, isAdditionalContentHeading: false });
      return;
    }

    const isAdditionalContentHeading =
      text === ADDITIONAL_CONTENT_HEADING_TEXT &&
      level === ADDITIONAL_CONTENT_HEADING_LEVEL &&
      !matchedAdditionalContentHeading;

    if (isAdditionalContentHeading) {
      matchedAdditionalContentHeading = true;
    }

    headingMatches.push({ lineIndex, meta: undefined, isAdditionalContentHeading });
  });

  // Each "segment" is a contiguous run of original lines: either the
  // preamble before the first heading, or a heading line plus its content
  // (up to the next heading or end of body). Segments are collected as line
  // arrays and concatenated (not pre-joined into strings and re-joined) so
  // that a stripped, content-less reserved-heading segment immediately
  // followed by another additionalContent-routed segment does not introduce
  // a newline that wasn't in the original text.
  const additionalLines: string[] = [];

  const firstHeadingLineIndex = headingMatches.length > 0 ? headingMatches[0].lineIndex : lines.length;
  if (firstHeadingLineIndex > 0) {
    additionalLines.push(...lines.slice(0, firstHeadingLineIndex));
  }

  headingMatches.forEach((heading, index) => {
    const nextLineIndex = index + 1 < headingMatches.length ? headingMatches[index + 1].lineIndex : lines.length;
    const segmentLines = lines.slice(heading.lineIndex, nextLineIndex);

    if (heading.meta) {
      // The heading line itself is not retained in the field's content.
      sections[heading.meta.key] = segmentLines.slice(1).join("\n");
    } else if (heading.isAdditionalContentHeading) {
      // The reserved heading line itself is not retained in the captured content.
      additionalLines.push(...segmentLines.slice(1));
    } else {
      additionalLines.push(...segmentLines);
    }
  });

  return { sections, additionalContent: additionalLines.join("\n") };
}

/**
 * Emits all 8 canonical MADR headings, in canonical order and level, each
 * followed by its field's content (which may be empty), then -- only if
 * `additionalContent` is non-empty -- emits the reserved
 * `## Additional Content` heading followed by `additionalContent` verbatim.
 * The reserved heading is omitted entirely when `additionalContent` is
 * empty. Pure function, no side effects.
 *
 * The reserved heading gives `splitSections` an unambiguous boundary to
 * re-detect on every read, so a `joinSections` -> `splitSections` round trip
 * reproduces `additionalContent` exactly for every input, including plain
 * prose with no leading heading line of its own.
 */
export function joinSections(sections: AdrSections, additionalContent: string): string {
  const parts: string[] = [];

  for (const meta of MADR_SECTIONS) {
    parts.push(`${"#".repeat(meta.level)} ${meta.heading}`);
    parts.push(sections[meta.key]);
  }

  let result = parts.join("\n");

  if (additionalContent !== "") {
    result = `${result}\n${ADDITIONAL_CONTENT_HEADING}\n${additionalContent}`;
  }

  return result;
}

/**
 * Produces the combined text of the 8 MADR section fields plus
 * `additionalContent`, for use by search indexing / embedding-text
 * construction.
 */
export function combinedSectionText(sections: AdrSections, additionalContent: string): string {
  const parts = MADR_SECTIONS.map((meta) => sections[meta.key]);
  parts.push(additionalContent);
  return parts.filter((part) => part !== "").join("\n\n");
}

function createEmptySections(): AdrSections {
  return {
    contextAndProblemStatement: "",
    decisionDrivers: "",
    consideredOptions: "",
    decisionOutcome: "",
    consequences: "",
    confirmation: "",
    prosAndConsOfTheOptions: "",
    moreInformation: "",
  };
}
