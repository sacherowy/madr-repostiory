import matter from "gray-matter";
import type { Adr, AdrFrontmatter } from "@adr/shared";

export function parseAdr(raw: string, path: string, blobSha: string): Adr {
  const { data, content } = matter(raw);
  const fm = data as AdrFrontmatter;
  return { ...fm, body: content.trim(), path, blobSha };
}

export function serializeAdr(adr: Adr): string {
  const { body, path: _p, blobSha: _b, ...fm } = adr;
  return matter.stringify(body + "\n", fm as Record<string, unknown>);
}
