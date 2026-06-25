import { QueryClient } from "@tanstack/react-query";

/**
 * Builds a {@link QueryClient} configured for this offline-capable tool.
 *
 * Defaults are tuned so transient/offline failures surface fast rather than
 * being masked by background refetching or long retry chains:
 * - `refetchOnWindowFocus: false` — there is no live remote to re-sync with on
 *   focus; the backend is local and changes flow through explicit user actions.
 * - `retry: false` — a failed fetch (e.g. the local API being down) should reach
 *   the UI immediately instead of being retried; aspect-count/preview hooks
 *   already degrade gracefully to an absent/empty state.
 *
 * Exported as a factory so tests can spin up a fresh, isolated client per render
 * (see `src/test/queryWrapper.ts`) without sharing the app-wide cache.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  });
}

/** Shared, app-wide client used by the root `QueryClientProvider` in `main.tsx`. */
export const queryClient = createQueryClient();
