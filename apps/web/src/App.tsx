import { useMemo, type ReactNode } from "react";
import type { AdrId } from "@adr/shared";

import { createApiClient } from "./api/client.js";
import type { ApiClient } from "./api/client.js";
import { usePortalStore, type PortalView } from "./state/portalStore.js";
import { TopNav, type TopNavDestination } from "./components/TopNav.js";
import { HomePage } from "./features/home/HomePage.js";
import { TopicsRail } from "./features/home/TopicsRail.js";
import { AttentionDigest } from "./features/home/AttentionDigest.js";
import { TopicsPage } from "./features/topics/TopicsPage.js";
import { PeoplePage } from "./features/people/PeoplePage.js";
import { ArticlePage } from "./features/article/ArticlePage.js";
import { OptionCompareCards } from "./features/article/OptionCompareCards.js";
import { ContextRail } from "./features/article/ContextRail.js";
import { TechnicalView } from "./features/article/TechnicalView.js";
import { ComposeContainer } from "./features/compose/ComposeContainer.js";
import type { RelationTarget } from "./features/compose/RelationsEditor.js";
import { useDecision } from "./hooks/useDecision.js";
import { useFeed } from "./hooks/useFeed.js";
import "./styles/portal.css";

// Editorial-portal composition root (design.md "Implementation Notes (web)":
// App.tsx becomes TopNav + switch on `view.kind`). There is no client-side
// router (Req 15.5): `portalStore.view` IS the navigation model and this shell
// switches over its `kind`. The default view is Home (Req 2.1). All server
// state stays in TanStack Query via the per-feature hooks; the store owns only
// the view union + the session author name.

interface AppProps {
  /** Optional injection seam mirroring the feature components' own DI pattern,
   * used by tests to provide a real test-server-backed client instead of the
   * default relative-URL client (which can't resolve in jsdom). Defaults to the
   * production client when omitted. */
  apiClient?: ApiClient;
}

/**
 * Maps the active `view.kind` to the three top-level destinations the TopNav can
 * mark current: a `topic` still counts as being in Topics, a `person` as being
 * in People (Impl Note 5.1: `active` typed home|topics|people so 8.1 maps
 * topic→topics, person→people). Reading an article or composing marks none.
 */
function activeDestination(view: PortalView): TopNavDestination | undefined {
  switch (view.kind) {
    case "home":
      return "home";
    case "topics":
    case "topic":
      return "topics";
    case "people":
    case "person":
      return "people";
    default:
      return undefined;
  }
}

/**
 * A feed-backed `id → title` resolver. Shared by the article's context rail
 * ("Replaced by <title>") and the compose form's derived-summary title
 * resolution. Reuses the single `["feed"]` query so no extra endpoint is hit.
 */
function useResolveTitle(apiClient: ApiClient): (id: AdrId) => string | undefined {
  const feed = useFeed(apiClient);
  return useMemo(() => {
    const byId = new Map((feed.data ?? []).map((card) => [card.id, card.title]));
    return (id: AdrId): string | undefined => byId.get(id);
  }, [feed.data]);
}

/**
 * The decision article view: loads the decision's data once via `useDecision`
 * and fills ArticlePage's `optionCompareCards` / `contextRail` slots from it
 * (Impl Note 6.4: all 6.x article components get wired into the article view in
 * 8.1). It also owns the Technical-view ENTRY toggle — `toggleTechnicalView`
 * flips `view.technical` (4.1), and while it is set the raw-record TechnicalView
 * replaces the article (7.1/7.5 return-to-article is TechnicalView's `onClose`).
 */
function DecisionView({
  apiClient,
  adrId,
  technical,
  onOpenDecision,
  onEdit,
}: {
  apiClient: ApiClient;
  adrId: AdrId;
  technical: boolean;
  onOpenDecision: (id: AdrId) => void;
  onEdit: (id: AdrId) => void;
}) {
  const toggleTechnicalView = usePortalStore((state) => state.toggleTechnicalView);
  const decision = useDecision(apiClient, adrId);
  const resolveTitle = useResolveTitle(apiClient);
  const adr = decision.adr.data;

  if (technical) {
    return <TechnicalView apiClient={apiClient} adrId={adrId} onClose={toggleTechnicalView} />;
  }

  return (
    <div className="portal__article-view">
      <div className="portal__article-actions">
        <button
          type="button"
          className="btn btn--primary"
          data-testid="article-edit"
          onClick={() => onEdit(adrId)}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          data-testid="article-technical-enter"
          onClick={toggleTechnicalView}
        >
          Technical view
        </button>
      </div>

      <ArticlePage
        apiClient={apiClient}
        adrId={adrId}
        optionCompareCards={
          adr ? (
            <OptionCompareCards
              consideredOptions={adr.consideredOptions}
              prosAndConsOfTheOptions={adr.prosAndConsOfTheOptions}
              decisionOutcome={adr.decisionOutcome}
            />
          ) : null
        }
        contextRail={
          <ContextRail
            relations={decision.relations.data ?? []}
            history={decision.history.data ?? []}
            similar={decision.similar.data ?? []}
            resolveTitle={resolveTitle}
            onOpenDecision={onOpenDecision}
          />
        }
      />
    </div>
  );
}

/**
 * The compose view: mounts the 7.6 save wrapper (ComposeContainer) with the feed
 * supplying the relation-target candidates and the derived-summary title
 * resolver, and navigates to the freshly saved decision on publish.
 *
 * `adrId` absent = create mode; present = edit mode (Impl Note 7.6). The App
 * switch keys this on the decision id so the seed-once slot editors (7.2 seed
 * their rows at mount) refresh per decision when navigating edit → edit.
 */
function ComposeView({
  apiClient,
  authorName,
  adrId,
  onSaved,
}: {
  apiClient: ApiClient;
  authorName: string;
  adrId?: AdrId;
  onSaved: (id: AdrId) => void;
}) {
  const feed = useFeed(apiClient);
  const relationTargets = useMemo<RelationTarget[]>(
    () =>
      (feed.data ?? [])
        // A decision can't relate to itself; drop the edited decision from the
        // candidate list.
        .filter((card) => card.id !== adrId)
        .map((card) => ({ id: card.id, title: card.title })),
    [feed.data, adrId]
  );
  const resolveTitle = useResolveTitle(apiClient);

  return (
    <ComposeContainer
      apiClient={apiClient}
      authorName={authorName}
      adrId={adrId}
      relationTargets={relationTargets}
      resolveTitle={resolveTitle}
      onSaved={(adr) => onSaved(adr.id)}
    />
  );
}

/**
 * Editorial-portal shell: a top navigation plus a switch over the view union.
 * Home / Topics / People / decision article / compose all render from
 * `portalStore.view`; the TopNav author-name field is bound to the store's
 * `authorName` / `setAuthorName` and feeds save payloads (the digest matching
 * off it is owned by AttentionDigest — task 5.5), and New decision opens the
 * compose form.
 */
export function App({ apiClient: injectedApiClient }: AppProps = {}) {
  const apiClient = useMemo(() => injectedApiClient ?? createApiClient(), [injectedApiClient]);

  const view = usePortalStore((state) => state.view);
  const authorName = usePortalStore((state) => state.authorName);
  const navigate = usePortalStore((state) => state.navigate);
  const setAuthorName = usePortalStore((state) => state.setAuthorName);

  // Every decision destination lands on the plain-language article (navigate
  // normalizes technical:false — Impl Note 4.1).
  const openDecision = (id: AdrId) => navigate({ kind: "decision", id, technical: false });

  let content: ReactNode;
  switch (view.kind) {
    case "home":
      content = (
        <HomePage
          apiClient={apiClient}
          onOpenDecision={openDecision}
          topicsRail={
            <TopicsRail
              apiClient={apiClient}
              onSelectTopic={(path) => navigate({ kind: "topic", path })}
            />
          }
          attentionDigest={<AttentionDigest apiClient={apiClient} onOpenDecision={openDecision} />}
        />
      );
      break;

    case "topics":
    case "topic":
      content = (
        <TopicsPage
          apiClient={apiClient}
          selectedTopic={view.kind === "topic" ? view.path : undefined}
          onSelectTopic={(path) => navigate({ kind: "topic", path })}
          onOpenDecision={openDecision}
        />
      );
      break;

    case "people":
    case "person":
      content = (
        <PeoplePage
          apiClient={apiClient}
          // PeoplePage keys off the normalized person key, which is exactly what
          // its `onSelectPerson` emits and what the `person` view carries.
          selectedPerson={view.kind === "person" ? view.name : undefined}
          onSelectPerson={(key) => navigate({ kind: "person", name: key })}
          onOpenDecision={openDecision}
        />
      );
      break;

    case "decision":
      content = (
        <DecisionView
          apiClient={apiClient}
          adrId={view.id}
          technical={view.technical}
          onOpenDecision={openDecision}
          onEdit={(id) => navigate({ kind: "compose", id })}
        />
      );
      break;

    case "compose":
      content = (
        <ComposeView
          // Remount per decision so the seed-once slot editors (7.2) refresh
          // when navigating between edit targets (create keyed as "new").
          key={view.id ?? "new"}
          apiClient={apiClient}
          authorName={authorName}
          adrId={view.id}
          onSaved={openDecision}
        />
      );
      break;

    default: {
      // Exhaustiveness guard: every `view.kind` is handled above.
      const _exhaustive: never = view;
      content = _exhaustive;
    }
  }

  return (
    <div className="portal">
      <TopNav
        active={activeDestination(view)}
        onNavigateHome={() => navigate({ kind: "home" })}
        onNavigateTopics={() => navigate({ kind: "topics" })}
        onNavigatePeople={() => navigate({ kind: "people" })}
        authorName={authorName}
        onAuthorNameChange={setAuthorName}
        onNewDecision={() => navigate({ kind: "compose" })}
      />

      <main className="portal__main">{content}</main>
    </div>
  );
}
