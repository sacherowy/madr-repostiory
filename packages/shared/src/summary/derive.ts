import type { AdrId, AdrRelation, AdrStatus, ShortDescription } from "../types.js";

/**
 * Deterministic short-description resolution — layers 1-2 of the pipeline
 * (requirements 11.2, 12.1-12.5).
 *
 * Layer 1: an author-written frontmatter `summary` always wins when non-blank
 * (11.2). Layer 2: a status-specific derivation from data the record already
 * carries — outcome, options, drivers, relations, context (12.1-12.4).
 *
 * Pure module (12.5): no network, filesystem, or environment access of any
 * kind; the only inbound dependency is the shared type definitions, and the
 * only outward reach is the caller-supplied `resolveTitle`. Single
 * implementation shared by web and api so identical input yields identical
 * output everywhere.
 *
 * Total function: every input field may be an empty string/array; the resolver
 * never throws and degrades through 12.1→12.4 down to `{ text: "" }` when
 * every source is empty.
 */

/** Section/frontmatter projection consumed by the resolver. */
export interface DerivationInput {
  status: AdrStatus;
  /** Author-owned frontmatter summary (layer 1, 11.2). */
  summary?: string;
  decisionOutcome: string;
  consideredOptions: string;
  decisionDrivers: string;
  contextAndProblemStatement: string;
  date: string;
  relations: AdrRelation[];
}

/** Caller-supplied lookup for "Replaced by <title>" (12.3). */
export interface DerivationContext {
  resolveTitle(id: AdrId): string | undefined;
}

/**
 * Parses the canonical MADR outcome phrasing "Chosen option: X, because Y"
 * (12.1, 9.2). Accepts the variants present in this repository: the quoted
 * MADR form (`Chosen option: "X", because Y`), the unquoted editor form, and
 * the bold-markdown proposal form (`**Chosen option: X**, because Y` or
 * `Chosen option: **X**, ...`). Only the first line is considered. Returns
 * `null` when the text does not match or the option is empty.
 */
export function parseCanonicalOutcome(outcome: string): { option: string; because?: string } | null {
  const firstLine = outcome.trim().split("\n", 1)[0]?.trim() ?? "";
  const prefixMatch = /^(?:\*\*)?chosen option:\s*(.*)$/i.exec(firstLine);
  if (!prefixMatch) return null;

  let rest = prefixMatch[1];
  let because: string | undefined;

  const becauseSeparator = /,\s*because\s+/i.exec(rest);
  if (becauseSeparator) {
    because = rest.slice(becauseSeparator.index + becauseSeparator[0].length).trim() || undefined;
    rest = rest.slice(0, becauseSeparator.index);
  }

  const option = cleanToken(rest);
  if (!option) return null;

  return because === undefined ? { option } : { option, because: cleanBoldEdges(because) };
}

/**
 * Resolves a decision's short description: author summary when non-blank
 * (`source: "summary"`, 11.2), otherwise the status-specific derivation
 * (`source: "derived"`, 12.1-12.4).
 */
export function resolveShortDescription(input: DerivationInput, ctx: DerivationContext): ShortDescription {
  const summary = input.summary?.trim();
  if (summary) {
    return { text: summary, source: "summary" };
  }
  return { text: derive(input, ctx), source: "derived" };
}

function derive(input: DerivationInput, ctx: DerivationContext): string {
  switch (input.status) {
    case "accepted": {
      const decided = deriveDecided(input.decisionOutcome);
      if (decided) return decided;
      break;
    }
    case "proposed": {
      const weighing = deriveInDiscussion(input.consideredOptions, input.decisionDrivers);
      if (weighing) return weighing;
      break;
    }
    case "superseded":
    case "deprecated": {
      // 12.3 for Replaced; also covers Retired decisions that *have* a
      // replacement — 12.4 carves out only "Retired without a replacement".
      const replaced = deriveReplaced(input.relations, input.date, ctx);
      if (replaced) return replaced;
      break;
    }
  }

  // 12.4 (also the fall-through when a status-specific rule yields nothing):
  // first sentence of the outcome, else first sentence of the context.
  return firstSentence(input.decisionOutcome) || firstSentence(input.contextAndProblemStatement);
}

/** 12.1: canonical outcome → "We chose <option> — <reason>", else first sentence. */
function deriveDecided(decisionOutcome: string): string {
  const parsed = parseCanonicalOutcome(decisionOutcome);
  if (parsed) {
    return parsed.because ? `We chose ${parsed.option} — ${parsed.because}` : `We chose ${parsed.option}`;
  }
  return firstSentence(decisionOutcome);
}

/** 12.2: "Weighing <A> against <B>" (+N more), optional first-driver key concern. */
function deriveInDiscussion(consideredOptions: string, decisionDrivers: string): string {
  const options = extractItemTitles(consideredOptions);
  if (options.length === 0) return "";

  let text =
    options.length === 1
      ? `Considering ${options[0]}`
      : `Weighing ${options[0]} against ${options[1]}`;
  if (options.length > 2) {
    text += ` (+${options.length - 2} more)`;
  }

  const firstDriver = extractItemTitles(decisionDrivers)[0];
  if (firstDriver) {
    text += `. Key concern: ${firstDriver}`;
  }
  return text;
}

/** 12.3: "Replaced by <title> on <date>" from the superseded-by relation. */
function deriveReplaced(relations: AdrRelation[], date: string, ctx: DerivationContext): string {
  const replacement = relations.find((relation) => relation.type === "superseded-by");
  if (!replacement) return "";

  const title = ctx.resolveTitle(replacement.target)?.trim();
  if (!title) return "";

  const trimmedDate = date.trim();
  return trimmedDate ? `Replaced by ${title} on ${trimmedDate}` : `Replaced by ${title}`;
}

/**
 * Minimal option/driver title extraction from a markdown section string:
 * bullet list items (`* X` / `- X`, the grammar the web options editor
 * serializes), numbered items, and ATX option headings. Intentionally much
 * smaller than the web editor's option parsing — derivation needs titles only.
 */
function extractItemTitles(section: string): string[] {
  const titles: string[] = [];
  for (const line of section.split("\n")) {
    const match = /^\s*(?:[*-]|\d+\.|#{2,4})\s+(.+)$/.exec(line);
    if (!match) continue;
    const title = cleanToken(match[1]);
    if (title) titles.push(title);
  }
  return titles;
}

/**
 * First sentence of a text block for the 12.1/12.4 fallbacks: whitespace
 * (including newlines) is collapsed, and the cut is at the first sentence
 * terminator followed by whitespace or end of text; without a terminator the
 * whole normalised text is returned.
 */
function firstSentence(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const match = /^.*?[.!?](?=\s|$)/.exec(normalized);
  return match ? match[0] : normalized;
}

/** Strips surrounding quotes and bold markers from an extracted token. */
function cleanToken(raw: string): string {
  let token = cleanBoldEdges(raw);
  const quoted = /^"(.*)"$/.exec(token) ?? /^“(.*)”$/.exec(token);
  if (quoted) token = quoted[1].trim();
  return token;
}

/** Removes leading/trailing `**` left over from bold-markdown variants. */
function cleanBoldEdges(raw: string): string {
  return raw.trim().replace(/^\*+/, "").replace(/\*+$/, "").trim();
}
