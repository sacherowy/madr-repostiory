import { describe, it, expect } from "vitest";
import { relativeTime } from "./relativeTime.js";

// A fixed "now" so the friendly relative-time output is deterministic and
// testable (design.md "Implementation Notes (web)" / task 5.1: a small pure
// relative-time helper that allows an injected "now").
const NOW = new Date("2026-06-26T12:00:00Z");

describe("relativeTime", () => {
  it("renders the same calendar day as \"today\"", () => {
    expect(relativeTime("2026-06-26", NOW)).toBe("today");
    // A later time on the same UTC day is still \"today\".
    expect(relativeTime("2026-06-26T01:00:00Z", NOW)).toBe("today");
  });

  it("renders a future-dated decision as \"today\" rather than a negative age", () => {
    expect(relativeTime("2026-06-30", NOW)).toBe("today");
  });

  it("renders the previous calendar day as \"yesterday\"", () => {
    expect(relativeTime("2026-06-25", NOW)).toBe("yesterday");
  });

  it("renders a few days ago in whole days", () => {
    expect(relativeTime("2026-06-23", NOW)).toBe("3 days ago");
    expect(relativeTime("2026-06-20", NOW)).toBe("6 days ago");
  });

  it("renders weeks, months, and years with friendly rounding", () => {
    expect(relativeTime("2026-06-18", NOW)).toBe("1 week ago"); // 8 days
    expect(relativeTime("2026-06-05", NOW)).toBe("3 weeks ago"); // 21 days
    expect(relativeTime("2026-05-20", NOW)).toBe("1 month ago"); // 37 days
    expect(relativeTime("2026-01-01", NOW)).toBe("5 months ago"); // ~176 days
    expect(relativeTime("2025-06-26", NOW)).toBe("1 year ago"); // 365 days
    expect(relativeTime("2023-06-26", NOW)).toBe("3 years ago");
  });

  it("returns the raw input verbatim when the date cannot be parsed", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("not-a-date");
  });
});
