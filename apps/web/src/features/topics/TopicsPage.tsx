import { useMemo, type ReactNode } from "react";
import type { AdrId, FeedCard as FeedCardModel } from "@adr/shared";
import type { ApiClient } from "../../api/client.js";
import { FeedCard } from "../../components/FeedCard.js";
import { useFeed } from "../../hooks/useFeed.js";
import "../../styles/topics.css";

/**
 * A browsable topic derived from the feed (design.md "UI compositions" →
 * TopicsPage; Req 3.1). The topic identity is the folder `path` ("" = the
 * repository root); `name` is the leaf segment for display (folders shown as
 * Topics, Req 1.3), with the root rendered as "General" to match the same
 * convention `FeedCard` uses for root-level decisions.
 */
export interface TopicNode {
  /** Folder path that identifies the topic ("" = repository root). */
  path: string;
  /** Display name: the leaf path segment, or "General" for the root. */
  name: string;
  /** Nesting depth (0 = top-level, 1 = sub-topic, …) for indentation. */
  depth: number;
  /** Decisions whose topic is exactly this path. */
  directCount: number;
  /** Decisions in this topic OR any of its sub-topics (path-prefix match). */
  totalCount: number;
}

/** Leaf segment of a topic path; "General" for the repository root (""). */
function topicName(path: string): string {
  if (path === "") return "General";
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Decisions belonging to `path` including its sub-topics (Req 3.2). A card
 * matches when its topic is exactly `path` or is nested beneath it by a
 * `path + "/"` prefix. The root topic ("") is its own topic — it holds only
 * root-level decisions and is never an ancestor of a named folder.
 */
export function filterCardsForTopic(
  cards: readonly FeedCardModel[],
  path: string
): FeedCardModel[] {
  return cards.filter((c) => {
    const topic = c.topic ?? "";
    if (topic === path) return true;
    return path !== "" && topic.startsWith(`${path}/`);
  });
}

/**
 * Projects the feed cards into the list of browsable topics (Req 3.1), a pure
 * client-side grouping over `FeedCard.topic` — no new endpoint. Every folder
 * that holds a decision, plus each of its ancestor folders, becomes a topic, so
 * a decision in `backend/api` surfaces both `backend` and `backend/api` as
 * browsable (nested) topics. The root topic ("") is included only when
 * root-level decisions exist. Nodes are returned in pre-order (lexicographic by
 * path), so each sub-topic follows its parent.
 */
export function deriveTopics(cards: readonly FeedCardModel[]): TopicNode[] {
  const paths = new Set<string>();
  for (const card of cards) {
    const topic = card.topic ?? "";
    if (topic === "") {
      paths.add("");
      continue;
    }
    // Add the topic and every ancestor prefix so intermediate folders are
    // listed even when no decision lives directly in them.
    let acc = "";
    for (const segment of topic.split("/")) {
      acc = acc === "" ? segment : `${acc}/${segment}`;
      paths.add(acc);
    }
  }

  const nodes: TopicNode[] = [...paths].map((path) => ({
    path,
    name: topicName(path),
    depth: path === "" ? 0 : path.split("/").length - 1,
    directCount: cards.filter((c) => (c.topic ?? "") === path).length,
    totalCount: filterCardsForTopic(cards, path).length,
  }));

  nodes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return nodes;
}

export interface TopicsPageProps {
  /** Data source for the feed (topics are a client projection over it). */
  apiClient: ApiClient;
  /**
   * The selected topic path, or `undefined` to list all topics. A path (which
   * may be `""` for the root/General topic) switches to that topic's feed
   * including its sub-topics (Req 3.2). Kept `undefined`-vs-`""` distinct so the
   * root topic remains selectable while `undefined` means "no selection".
   */
  selectedTopic?: string;
  /** Fired to navigate INTO a topic from the list (Req 3.1 → 3.2). */
  onSelectTopic: (path: string) => void;
  /** Fired when a decision card is opened, mirroring HomePage's contract (Req 2.6). */
  onOpenDecision: (id: AdrId) => void;
  /** Injectable "now" forwarded to each FeedCard for deterministic timestamps. */
  now?: Date;
}

/**
 * Topics destination (design.md File Structure → `TopicsPage`; Req 3.1, 3.2,
 * 3.4). With no `selectedTopic` it lists every folder as a browsable topic,
 * including nested folders as sub-topics; selecting one navigates via
 * `onSelectTopic`. With a `selectedTopic` it shows that topic's feed (its own
 * decisions plus those of its sub-topics), or an inviting empty state when the
 * topic holds no decisions (Req 3.4) rather than a blank feed.
 *
 * Topics are a pure client projection over the `["feed"]` query (shared with
 * HomePage via `useFeed`), so no new endpoint is introduced.
 */
export function TopicsPage({
  apiClient,
  selectedTopic,
  onSelectTopic,
  onOpenDecision,
  now,
}: TopicsPageProps) {
  const feed = useFeed(apiClient);
  const cards = useMemo(() => feed.data ?? [], [feed.data]);

  const topics = useMemo(() => deriveTopics(cards), [cards]);
  const topicCards = useMemo(
    () => (selectedTopic === undefined ? [] : filterCardsForTopic(cards, selectedTopic)),
    [cards, selectedTopic]
  );

  let content: ReactNode;
  if (feed.isPending) {
    content = (
      <div className="state state--loading" data-testid="topics-loading">
        <span className="state__spinner" aria-hidden="true" />
        <p className="state__message">Loading topics…</p>
      </div>
    );
  } else if (feed.isError) {
    content = (
      <div className="state state--error" data-testid="topics-error">
        <p className="state__title">Couldn’t load topics.</p>
        <p className="state__message">Please try again in a moment.</p>
      </div>
    );
  } else if (selectedTopic === undefined) {
    // Topic list view.
    content =
      topics.length === 0 ? (
        <div className="state state--empty" data-testid="topics-empty">
          <p className="state__title">No topics yet.</p>
          <p className="state__message">
            Topics appear here as you file decisions into folders.
          </p>
        </div>
      ) : (
        <ul className="topics__list" data-testid="topics-list">
          {topics.map((topic) => (
            <li key={topic.path || "__root__"} className="topics__list-item">
              <button
                type="button"
                className="topic-item"
                data-testid={`topic-item-${topic.path}`}
                data-topic-path={topic.path}
                data-depth={topic.depth}
                style={{ paddingLeft: `${12 + topic.depth * 16}px` }}
                aria-label={`Browse topic: ${topic.path === "" ? "General" : topic.path}`}
                onClick={() => onSelectTopic(topic.path)}
              >
                <span className="topic-item__name">{topic.name}</span>
                <span className="topic-item__count" aria-hidden="true">
                  {topic.totalCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
  } else {
    // Per-topic feed view.
    const heading = selectedTopic === "" ? "General" : selectedTopic;
    content = (
      <section className="topics__topic" aria-label={`Decisions in ${heading}`}>
        <h2 className="topics__topic-heading" data-testid="topic-heading">
          {heading}
        </h2>
        {topicCards.length === 0 ? (
          <div className="state state--empty" data-testid="topic-empty">
            <p className="state__title">No decisions in this topic yet.</p>
            <p className="state__message">
              Decisions filed under “{heading}” will show up here.
            </p>
          </div>
        ) : (
          <ul className="topics__feed" data-testid="topic-feed">
            {topicCards.map((card) => (
              <li key={card.id} className="topics__feed-item">
                <FeedCard card={card} onOpen={onOpenDecision} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="topics" data-testid="topics-page">
      {content}
    </div>
  );
}
