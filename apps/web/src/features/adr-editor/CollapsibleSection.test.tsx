import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { CollapsibleSection } from "./CollapsibleSection.js";

afterEach(() => cleanup());

describe("CollapsibleSection", () => {
  describe("basic rendering", () => {
    it("renders a button header with the correct data-testid", () => {
      render(
        <CollapsibleSection
          sectionKey="decisionDrivers"
          title="Decision Drivers"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      expect(
        screen.getByTestId("section-toggle-decisionDrivers")
      ).toBeInTheDocument();
    });

    it("renders the title text in the header", () => {
      render(
        <CollapsibleSection
          sectionKey="decisionDrivers"
          title="Decision Drivers"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const toggle = screen.getByTestId("section-toggle-decisionDrivers");
      expect(toggle.textContent).toContain("Decision Drivers");
    });

    it("renders children inside the body", () => {
      render(
        <CollapsibleSection
          sectionKey="decisionDrivers"
          title="Decision Drivers"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea data-testid="child-textarea" />
        </CollapsibleSection>
      );

      expect(screen.getByTestId("child-textarea")).toBeInTheDocument();
    });
  });

  describe("open state (isOpen=true)", () => {
    it("sets aria-expanded=true on the header button", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview="Some content"
        >
          <textarea />
        </CollapsibleSection>
      );

      const toggle = screen.getByTestId("section-toggle-mySection");
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });

    it("does NOT have hidden attribute on the body div when open", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview="Some content"
        >
          <textarea data-testid="child-textarea" />
        </CollapsibleSection>
      );

      const body = container.querySelector(".collapsible-section__body");
      expect(body).toBeInTheDocument();
      expect(body).not.toHaveAttribute("hidden");
    });

    it("applies chevron--open class when open", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const chevron = container.querySelector(".collapsible-section__chevron");
      expect(chevron).toHaveClass("collapsible-section__chevron--open");
    });

    it("hides the preview when open", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview="Some preview text"
        >
          <textarea />
        </CollapsibleSection>
      );

      expect(screen.queryByText("Some preview text")).not.toBeInTheDocument();
    });

    it("hides '— empty' indicator when open and preview is empty", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      expect(screen.queryByText("— empty")).not.toBeInTheDocument();
    });
  });

  describe("closed state (isOpen=false)", () => {
    it("sets aria-expanded=false on the header button", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const toggle = screen.getByTestId("section-toggle-mySection");
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("applies hidden attribute on the body div when closed", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea data-testid="child-textarea" />
        </CollapsibleSection>
      );

      const body = container.querySelector(".collapsible-section__body");
      expect(body).toHaveAttribute("hidden");
    });

    it("children remain in the DOM even when closed (hidden, not removed)", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea data-testid="child-textarea" />
        </CollapsibleSection>
      );

      // The textarea must exist in DOM (for toHaveValue assertions on collapsed sections)
      expect(screen.getByTestId("child-textarea")).toBeInTheDocument();
    });

    it("does NOT apply chevron--open class when closed", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const chevron = container.querySelector(".collapsible-section__chevron");
      expect(chevron).not.toHaveClass("collapsible-section__chevron--open");
    });

    it("shows the preview text when collapsed and preview is non-empty", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={vi.fn()}
          preview="First line of content"
        >
          <textarea />
        </CollapsibleSection>
      );

      expect(screen.getByText("First line of content")).toBeInTheDocument();
    });

    it("shows '— empty' when collapsed and preview is empty string", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      expect(screen.getByText("— empty")).toBeInTheDocument();
    });
  });

  describe("required prop", () => {
    it("appends ' *' to the title when required=true", () => {
      render(
        <CollapsibleSection
          sectionKey="contextAndProblemStatement"
          title="Context and Problem Statement"
          required={true}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const titleSpan = document.querySelector(".collapsible-section__title");
      expect(titleSpan?.textContent).toBe("Context and Problem Statement *");
    });

    it("does NOT append ' *' to the title when required=false", () => {
      render(
        <CollapsibleSection
          sectionKey="decisionDrivers"
          title="Decision Drivers"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const titleSpan = document.querySelector(".collapsible-section__title");
      expect(titleSpan?.textContent).toBe("Decision Drivers");
    });

    it("does NOT append ' *' to the title when required is omitted (defaults to false)", () => {
      render(
        <CollapsibleSection
          sectionKey="decisionDrivers"
          title="Decision Drivers"
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const titleSpan = document.querySelector(".collapsible-section__title");
      expect(titleSpan?.textContent).toBe("Decision Drivers");
    });

    it("applies collapsible-section--required class on the outer wrapper when required=true", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="contextAndProblemStatement"
          title="Context and Problem Statement"
          required={true}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("collapsible-section--required");
    });

    it("does NOT apply collapsible-section--required class when required=false", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="decisionDrivers"
          title="Decision Drivers"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const wrapper = container.firstChild;
      expect(wrapper).not.toHaveClass("collapsible-section--required");
    });
  });

  describe("onToggle callback", () => {
    it("calls onToggle when the header button is clicked", () => {
      const onToggle = vi.fn();
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={false}
          onToggle={onToggle}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      fireEvent.click(screen.getByTestId("section-toggle-mySection"));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("CSS class structure", () => {
    it("outer wrapper has collapsible-section class", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      expect(container.firstChild).toHaveClass("collapsible-section");
    });

    it("header button has collapsible-section__header class", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const btn = screen.getByTestId("section-toggle-mySection");
      expect(btn).toHaveClass("collapsible-section__header");
    });

    it("title span has collapsible-section__title class and id=section-title-{sectionKey}", () => {
      render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const titleSpan = document.getElementById("section-title-mySection");
      expect(titleSpan).toBeInTheDocument();
      expect(titleSpan).toHaveClass("collapsible-section__title");
    });

    it("body div has collapsible-section__body class", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const body = container.querySelector(".collapsible-section__body");
      expect(body).toBeInTheDocument();
    });

    it("chevron element has collapsible-section__chevron class", () => {
      const { container } = render(
        <CollapsibleSection
          sectionKey="mySection"
          title="My Section"
          required={false}
          isOpen={true}
          onToggle={vi.fn()}
          preview=""
        >
          <textarea />
        </CollapsibleSection>
      );

      const chevron = container.querySelector(".collapsible-section__chevron");
      expect(chevron).toBeInTheDocument();
    });
  });
});
