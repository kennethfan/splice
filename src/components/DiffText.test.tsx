import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DiffText } from "./DiffText";
import type { WordChange } from "../lib/tauri";

describe("DiffText", () => {
  it("renders plain text when wordChanges is null", () => {
    const { container } = render(<DiffText wordChanges={null} text="hello world" />);
    expect(container.textContent).toBe("hello world");
  });

  it("renders plain text when wordChanges is empty", () => {
    const { container } = render(<DiffText wordChanges={[]} text="hello world" />);
    expect(container.textContent).toBe("hello world");
  });

  it("renders unchanged words without special styling", () => {
    const changes: WordChange[] = [
      { text: "hello", status: "unchanged" },
      { text: " world", status: "unchanged" },
    ];
    const { container } = render(<DiffText wordChanges={changes} text="hello world" />);
    expect(container.textContent).toBe("hello world");
    const spans = container.querySelectorAll(".diff-word");
    expect(spans).toHaveLength(2);
    expect(spans[0]).not.toHaveClass("diff-word--added");
    expect(spans[0]).not.toHaveClass("diff-word--removed");
  });

  it("highlights added words", () => {
    const changes: WordChange[] = [
      { text: "const", status: "unchanged" },
      { text: " newVar", status: "added" },
    ];
    const { container } = render(<DiffText wordChanges={changes} text="const newVar" />);
    const addedSpan = container.querySelector(".diff-word--added");
    expect(addedSpan).toBeInTheDocument();
    expect(addedSpan?.textContent).toBe(" newVar");
  });

  it("highlights removed words with strikethrough", () => {
    const changes: WordChange[] = [
      { text: "const", status: "unchanged" },
      { text: " oldVar", status: "removed" },
    ];
    const { container } = render(<DiffText wordChanges={changes} text="const oldVar" />);
    const removedSpan = container.querySelector(".diff-word--removed");
    expect(removedSpan).toBeInTheDocument();
    expect(removedSpan?.textContent).toBe(" oldVar");
  });

  it("highlights modified words", () => {
    const changes: WordChange[] = [
      { text: "const", status: "unchanged" },
      { text: " x", status: "modified" },
    ];
    const { container } = render(<DiffText wordChanges={changes} text="const x" />);
    const modifiedSpan = container.querySelector(".diff-word--modified");
    expect(modifiedSpan).toBeInTheDocument();
    expect(modifiedSpan?.textContent).toBe(" x");
  });

  it("renders mixed unchanged, added, and removed words", () => {
    const changes: WordChange[] = [
      { text: "return ", status: "unchanged" },
      { text: "`Hi", status: "added" },
      { text: " there", status: "added" },
      { text: ", ", status: "unchanged" },
      { text: "name", status: "unchanged" },
      { text: "!`", status: "added" },
    ];
    const { container } = render(
      <DiffText wordChanges={changes} text="return `Hi there, name!`" />,
    );
    expect(container.textContent).toBe("return `Hi there, name!`");
    const addedSpans = container.querySelectorAll(".diff-word--added");
    expect(addedSpans.length).toBeGreaterThan(0);
  });

  it("renders an empty string gracefully", () => {
    const { container } = render(<DiffText wordChanges={null} text="" />);
    expect(container.textContent).toBe("");
  });
});
