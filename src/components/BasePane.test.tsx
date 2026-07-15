import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BasePane } from "./BasePane";
import type { ConflictBlock as ConflictBlockType } from "../lib/tauri";

describe("BasePane", () => {
  const conflicts: ConflictBlockType[] = [
    {
      id: 1,
      local_lines: ["local"],
      base_lines: null,
      remote_lines: ["remote"],
      status: "Unresolved",
      start_line: 2,
      end_line: 6,
    },
  ];

  const defaultProps = {
    content: "line1\nbase_content\nline3\n",
    conflicts,
    activeConflictId: 0,
    scrollRef: { current: null } as React.RefObject<HTMLDivElement | null>,
    onScroll: vi.fn(),
    highlightedLines: ["line1", "base_content", "line3"],
  };

  it("renders Base header", () => {
    render(<BasePane {...defaultProps} />);

    expect(screen.getByText(/Base/)).toBeInTheDocument();
  });

  it("renders placeholder when content is empty", () => {
    render(<BasePane {...defaultProps} content="" />);

    expect(screen.getByText(/BASE version is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/zdiff3/)).toBeInTheDocument();
  });

  it("shows Cmd+\\ hint when content exists", () => {
    render(<BasePane {...defaultProps} />);

    expect(screen.getByText(/Cmd/)).toBeInTheDocument();
  });

  it("renders lines with correct line numbers", () => {
    const { container } = render(<BasePane {...defaultProps} />);

    const lineNumbers = container.querySelectorAll(".line-number");
    // Content is "line1\nbase_content\nline3\n" -> split by \n gives 4 parts
    // The component renders all parts including the trailing empty string
    expect(lineNumbers.length).toBe(4);
    expect(lineNumbers[0]).toHaveTextContent("1");
    expect(lineNumbers[1]).toHaveTextContent("2");
    expect(lineNumbers[2]).toHaveTextContent("3");
    expect(lineNumbers[3]).toHaveTextContent("4");
  });

  it("applies base styling for conflict region lines", () => {
    const { container } = render(<BasePane {...defaultProps} activeConflictId={1} />);

    const lines = container.querySelectorAll(".pane-line");
    // Line 2 falls within conflict lines 2-6
    const line2 = lines[1];
    expect(line2).toHaveClass("pane-line--base-active");
  });

  it("applies resolved styling for resolved conflicts", () => {
    const resolvedConflicts: ConflictBlockType[] = [
      {
        ...conflicts[0],
        status: "ResolvedWithLocal",
      },
    ];

    const { container } = render(
      <BasePane {...defaultProps} conflicts={resolvedConflicts} activeConflictId={1} />
    );

    const lines = container.querySelectorAll(".pane-line");
    const line2 = lines[1];
    expect(line2).toHaveClass("pane-line--resolved");
  });

  it("renders without highlightedLines gracefully", () => {
    const { container } = render(
      <BasePane {...defaultProps} highlightedLines={undefined} />
    );

    const lines = container.querySelectorAll(".pane-line");
    // Content "line1\nbase_content\nline3\n" gives 4 parts when split by \n
    expect(lines.length).toBe(4);
  });
});
