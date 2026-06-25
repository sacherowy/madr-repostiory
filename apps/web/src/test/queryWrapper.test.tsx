import { renderHook, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { createQueryWrapper } from "./queryWrapper.js";

describe("createQueryWrapper", () => {
  it("lets a trivial useQuery hook resolve to its data through a fresh QueryClientProvider", async () => {
    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ["trivial"],
          queryFn: () => Promise.resolve("hello"),
        }),
      { wrapper: createQueryWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("hello");
  });

  it("returns a fresh client per call so cache does not bleed across renders", async () => {
    const wrapperA = createQueryWrapper();
    const wrapperB = createQueryWrapper();

    const a = renderHook(
      () =>
        useQuery({
          queryKey: ["isolation"],
          queryFn: () => Promise.resolve("from-a"),
        }),
      { wrapper: wrapperA }
    );
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));

    // The second wrapper has its own client, so the same key starts cold and
    // resolves to its own queryFn rather than reading wrapperA's cached value.
    const b = renderHook(
      () =>
        useQuery({
          queryKey: ["isolation"],
          queryFn: () => Promise.resolve("from-b"),
        }),
      { wrapper: wrapperB }
    );
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    expect(b.result.current.data).toBe("from-b");
  });
});
