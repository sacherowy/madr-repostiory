import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { AdrStatus } from "@adr/shared";
import { StatusBadge } from "./StatusBadge.js";

const KNOWN_STATUSES: AdrStatus[] = ["proposed", "accepted", "deprecated", "superseded"];
const ALL_MODIFIERS = KNOWN_STATUSES.map((s) => `badge--${s}`);

function getBadge() {
  return screen.getByTestId("status-badge");
}

describe("StatusBadge", () => {
  it.each(KNOWN_STATUSES)(
    "maps the %s status to the base badge class plus its own modifier class",
    (status) => {
      render(<StatusBadge status={status} data-testid="status-badge" />);
      const badge = getBadge();

      // Req 4.1: status color/background applied via the status modifier class.
      expect(badge).toHaveClass("badge");
      expect(badge).toHaveClass(`badge--${status}`);

      // It must carry ONLY its own status modifier, never another status's.
      for (const other of ALL_MODIFIERS.filter((m) => m !== `badge--${status}`)) {
        expect(badge).not.toHaveClass(other);
      }
    }
  );

  it.each(KNOWN_STATUSES)("renders a dot element and a human-readable label for %s", (status) => {
    render(<StatusBadge status={status} data-testid="status-badge" />);
    const badge = getBadge();

    // Req 4.2: colored dot element.
    expect(badge.querySelector(".badge__dot")).not.toBeNull();

    // Req 4.2: a human-readable label — non-empty, and a proper display label
    // (capitalized) rather than the bare lowercase raw key.
    const label = badge.querySelector(".badge__label");
    expect(label).not.toBeNull();
    expect(label?.textContent?.trim()).toBeTruthy();
    expect(label?.textContent?.trim()).not.toBe(status);
    expect(label?.textContent?.trim()?.toLowerCase()).toBe(status);
  });

  it("renders an unknown status with the neutral badge treatment (no status modifier)", () => {
    render(<StatusBadge status="draft" data-testid="status-badge" />);
    const badge = getBadge();

    // Req 4.3: neutral base badge class, none of the four status modifiers.
    expect(badge).toHaveClass("badge");
    for (const modifier of ALL_MODIFIERS) {
      expect(badge).not.toHaveClass(modifier);
    }

    // Still renders a dot and the raw value as the label for an unknown status.
    expect(badge.querySelector(".badge__dot")).not.toBeNull();
    expect(badge.querySelector(".badge__label")?.textContent?.trim()).toBe("draft");
  });

  it("appends a caller-provided className after the design-system class", () => {
    render(<StatusBadge status="accepted" className="extra-class" data-testid="status-badge" />);
    const badge = getBadge();

    expect(badge).toHaveClass("badge");
    expect(badge).toHaveClass("badge--accepted");
    expect(badge).toHaveClass("extra-class");
  });

  it("applies a caller-provided data-testid", () => {
    render(<StatusBadge status="proposed" data-testid="my-custom-badge" />);

    expect(screen.getByTestId("my-custom-badge")).toBeInTheDocument();
    expect(screen.getByTestId("my-custom-badge")).toHaveClass("badge--proposed");
  });
});
