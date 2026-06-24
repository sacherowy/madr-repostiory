import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "../state/queryClient.js";

/**
 * Test helper that wraps children in a fresh {@link QueryClientProvider}.
 *
 * Each call builds its own {@link createQueryClient} instance so server-state
 * caches never bleed across tests or across renders within a test. Use it as the
 * `wrapper` option of `@testing-library/react`'s `render` / `renderHook`:
 *
 * ```ts
 * renderHook(() => useSomeQuery(), { wrapper: createQueryWrapper() });
 * ```
 */
export function createQueryWrapper(): ({ children }: { children: ReactNode }) => JSX.Element {
  const client = createQueryClient();
  return function QueryWrapper({ children }: { children: ReactNode }): JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
