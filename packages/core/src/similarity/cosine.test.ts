import { describe, it, expect } from "vitest";
import { cosine, rankPairs } from "./cosine.js";

describe("cosine", () => {
  it("identyczne wektory → 1", () => expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1));
  it("ortogonalne → 0", () => expect(cosine([1, 0], [0, 1])).toBeCloseTo(0));
});

describe("rankPairs", () => {
  it("sortuje malejąco po podobieństwie", () => {
    const pairs = rankPairs([
      { id: "a", vector: [1, 0] },
      { id: "b", vector: [1, 0] },
      { id: "c", vector: [0, 1] },
    ]);
    expect(pairs[0]).toMatchObject({ a: "a", b: "b" });
    expect(pairs[0].score).toBeGreaterThanOrEqual(pairs[pairs.length - 1].score);
  });
});
