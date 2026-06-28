import matter from "gray-matter";
import type { Adr, AdrFrontmatter } from "@adr/shared";

/** Matches the first ATX H1 heading line (`# Heading text`, or `# ` with
 * empty heading text) anywhere in the body, not just at the literal first
 * line — robust to leading blank lines left over from frontmatter stripping.
 * Captures the heading text (group 1, possibly empty) and the full matched
 * line (group 0) so callers can both read the title and remove exactly that
 * line from the body. The trailing space after `#` is required (ATX
 * convention) but the text itself may be empty, so that the empty-title
 * round trip (`# ` <-> `title: ""`) is lossless instead of leaving a stray
 * heading marker behind in the body. */
const H1_PATTERN = /^# (.*)$/m;

/** Extracts the title from the body's first top-level (H1) heading, per the
 * Title Resolution flow in design.md: H1 wins when present (its line is
 * stripped from the returned body); otherwise falls back to a legacy
 * frontmatter `title` key (body unchanged, since there was no H1 to strip);
 * otherwise the title is "" (missing), consistent with how other
 * required-but-absent fields degrade to a falsy value elsewhere in this
 * module rather than throwing or using a null/undefined sentinel. */
function resolveTitle(
  content: string,
  legacyTitle: unknown
): { title: string; body: string } {
  const match = H1_PATTERN.exec(content);
  if (match) {
    const title = match[1].trim();
    const body = content.slice(0, match.index) + content.slice(match.index + match[0].length);
    return { title, body: body.replace(/^\n+/, "").trim() };
  }

  const title = typeof legacyTitle === "string" ? legacyTitle : "";
  return { title, body: content.trim() };
}

export function parseAdr(raw: string, path: string, blobSha: string): Adr {
  const { data, content } = matter(raw);
  const rawFm = data as Record<string, unknown>;
  const { "decision-makers": decisionMakersKey, deciders, title: legacyTitle, ...rest } = rawFm;
  const fm = rest as unknown as AdrFrontmatter;
  const decisionMakers = (decisionMakersKey ?? deciders) as string[] | undefined;

  const { title, body } = resolveTitle(content, legacyTitle);

  return {
    ...fm,
    ...(decisionMakers !== undefined ? { decisionMakers } : {}),
    title,
    body,
    path,
    blobSha,
  };
}

export function serializeAdr(adr: Adr): string {
  const { body, path: _p, blobSha: _b, title, decisionMakers, ...fm } = adr;
  const frontmatter: Record<string, unknown> = { ...fm };
  if (decisionMakers !== undefined) {
    frontmatter["decision-makers"] = decisionMakers;
  }
  const bodyWithTitle = `# ${title}\n\n${body}`;
  return matter.stringify(bodyWithTitle + "\n", frontmatter);
}
