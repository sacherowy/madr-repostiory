import matter from "gray-matter";
import type { Adr, AdrFrontmatter } from "@adr/shared";

export function parseAdr(raw: string, path: string, blobSha: string): Adr {
  const { data, content } = matter(raw);
  const rawFm = data as Record<string, unknown>;
  const { "decision-makers": decisionMakersKey, deciders, title: legacyTitle, ...rest } = rawFm;
  const fm = rest as unknown as AdrFrontmatter;
  const decisionMakers = (decisionMakersKey ?? deciders) as string[] | undefined;

  // Minimal placeholder title handling for this task only: read a legacy
  // literal frontmatter `title` key when present, else fall back to "".
  // Task 2.2 owns real H1 extraction/legacy-title-fallback logic and will
  // replace this.
  const title = typeof legacyTitle === "string" ? legacyTitle : "";

  return {
    ...fm,
    ...(decisionMakers !== undefined ? { decisionMakers } : {}),
    title,
    body: content.trim(),
    path,
    blobSha,
  };
}

export function serializeAdr(adr: Adr): string {
  const { body, path: _p, blobSha: _b, title: _t, decisionMakers, ...fm } = adr;
  const frontmatter: Record<string, unknown> = { ...fm };
  if (decisionMakers !== undefined) {
    frontmatter["decision-makers"] = decisionMakers;
  }
  return matter.stringify(body + "\n", frontmatter);
}
