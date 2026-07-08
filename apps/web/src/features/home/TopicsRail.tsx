import { useMemo } from "react";
import type { ApiClient } from "../../api/client.js";
import { useFeed } from "../../hooks/useFeed.js";
import { deriveTopics } from "../topics/TopicsPage.js";
import "../../styles/topics.css";

export interface TopicsRailProps {
  /** Data source for the feed (the rail is a client projection over it). */
  apiClient: ApiClient;
  /**
   * Fired with a topic path to link into the Topics destination filtered to
   * that topic (Req 3.3). The parent maps this to `navigate({kind:"topic",…})`
   * in task 8.1; kept as a prop so the rail stays unit-testable in isolation.
   */
  onSelectTopic: (path: string) => void;
}

/**
 * Home "Topics" rail (design.md File Structure → `TopicsRail`; Req 3.3): a
 * compact summary of the available top-level topics, each a shortcut into the
 * Topics destination filtered to that topic. It reuses the same `["feed"]`
 * query as HomePage/TopicsPage via `useFeed` and the shared `deriveTopics`
 * projection, so it introduces no new endpoint and stays consistent with the
 * full Topics destination.
 *
 * It fills HomePage's `topicsRail` mount slot additively (task 5.2 exposed the
 * optional `ReactNode` prop); it renders nothing until there is at least one
 * topic, so the empty slot collapses cleanly on a fresh repo.
 */
export function TopicsRail({ apiClient, onSelectTopic }: TopicsRailProps) {
  const feed = useFeed(apiClient);
  const cards = useMemo(() => feed.data ?? [], [feed.data]);

  // Only the top-level topics are summarized in the rail; the full nested list
  // lives in the Topics destination (TopicsPage). Each rail entry's count still
  // includes its sub-topics via the shared prefix-aware projection.
  const topLevel = useMemo(
    () => deriveTopics(cards).filter((topic) => topic.depth === 0),
    [cards]
  );

  if (feed.isPending || feed.isError || topLevel.length === 0) {
    // Quietly absent until there is something to summarize; keeps the Home rail
    // slot empty (and thus collapsed) rather than showing a hollow box.
    return null;
  }

  return (
    <nav className="topics-rail" aria-label="Topics" data-testid="topics-rail">
      <h2 className="topics-rail__title">Topics</h2>
      <ul className="topics-rail__list">
        {topLevel.map((topic) => (
          <li key={topic.path || "__root__"} className="topics-rail__list-item">
            <button
              type="button"
              className="topics-rail__item"
              data-testid={`rail-topic-${topic.path}`}
              data-topic-path={topic.path}
              aria-label={`Browse topic: ${topic.path === "" ? "General" : topic.path}`}
              onClick={() => onSelectTopic(topic.path)}
            >
              <span className="topics-rail__name">{topic.name}</span>
              <span className="topics-rail__count" aria-hidden="true">
                {topic.totalCount}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
