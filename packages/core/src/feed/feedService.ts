import type { FeedCard } from "@adr/shared";
import { resolveShortDescription, type DerivationContext } from "@adr/shared";
import type { GitPort } from "../ports/git.js";
import { parseAdr } from "../adr/parse.js";

/** Parent folder path of an ADR file — the card's topic; "" for files at the
 * repository root (FeedCard.topic contract in @adr/shared). */
function topicOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/**
 * Frontmatter `date` is typed as string, but an unquoted YAML date
 * (`date: 2026-06-17`, the form real records in this repository use) is
 * parsed by gray-matter/js-yaml into a JS Date at runtime. Normalize to the
 * ISO day string so sorting stays a plain string comparison and the shared
 * derivation (which trims/renders the date) always receives a string.
 */
function toDateString(date: unknown): string {
  if (typeof date === "string") return date;
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }
  return "";
}

/**
 * Assembles the FeedCard[] read model powering Home/Topics/People/digest/
 * search rendering (Req 2.3): scans the repository via GitPort (the same
 * listAdrFiles+read+parseAdr scan every other service uses), skips files
 * parseAdr cannot handle so one broken record never empties the feed, and
 * resolves each card's short description through the shared derivation
 * (Req 12.1-12.4) with a title resolver spanning every parsed record — so
 * "Replaced by <title>" resolves across folders.
 *
 * Read-only and zero I/O beyond the injected GitPort; cards are derived per
 * call and never cached or persisted.
 */
export class FeedService {
  constructor(
    private readonly git: GitPort,
    private readonly root: string = "."
  ) {}

  /** One card per parseable ADR, sorted by date descending, then id ascending. */
  async buildFeed(): Promise<FeedCard[]> {
    const files = await this.git.listAdrFiles(this.root);

    const adrs = [];
    for (const file of files) {
      const raw = await this.git.read(file.path);
      try {
        adrs.push(parseAdr(raw, file.path, file.blobSha));
      } catch {
        // Unparseable record (e.g. malformed frontmatter YAML): skip it and
        // keep assembling cards for the rest — the feed tolerates a single
        // broken file the same way the design's postcondition demands.
      }
    }

    const titleById = new Map(adrs.map((adr) => [adr.id, adr.title]));
    const ctx: DerivationContext = {
      resolveTitle: (id) => titleById.get(id),
    };

    const cards: FeedCard[] = adrs.map((adr) => {
      const date = toDateString(adr.date);
      return {
        id: adr.id,
        title: adr.title,
        status: adr.status,
        path: adr.path,
        topic: topicOf(adr.path),
        date,
        decisionMakers: adr.decisionMakers ?? [],
        consulted: adr.consulted ?? [],
        informed: adr.informed ?? [],
        shortDescription: resolveShortDescription(
          {
            status: adr.status,
            summary: adr.summary,
            decisionOutcome: adr.decisionOutcome,
            consideredOptions: adr.consideredOptions,
            decisionDrivers: adr.decisionDrivers,
            contextAndProblemStatement: adr.contextAndProblemStatement,
            date,
            relations: adr.relations ?? [],
          },
          ctx
        ),
      };
    });

    cards.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.id !== b.id) return a.id < b.id ? -1 : 1;
      return 0;
    });

    return cards;
  }
}
