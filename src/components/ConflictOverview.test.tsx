import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConflictOverview } from "./ConflictOverview";
import type { ConflictBlock as ConflictBlockType } from "../lib/tauri";

describe("ConflictOverview", () => {
  const conflicts: ConflictBlockType[] = [
    {
      id: 1,
      local_lines: ["local1"],
      base_lines: null,
      remote_lines: ["remote1"],
      status: "Unresolved",
      start_line: 2,
      end_line: 6,
    },
    {
      id: 2,
      local_lines: ["local2"],
      base_lines: null,
      remote_lines: ["remote2"],
      status: "ResolvedWithLocal",
      start_line: 10,
      end_line: 14,
    },
    {
      id: 3,
      local_lines: ["local3"],
      base_lines: null,
      remote_lines: ["remote3"],
      status: "Unresolved",
      start_line: 20,
      end_line: 24,
    },
  ];

  const defaultProps = {
    conflicts,
    activeConflictId: 1,
    isOpen: true,
    onClose: vi.fn(),
    onJumpTo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <ConflictOverview {...defaultProps} isOpen={false} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows unresolved and resolved sections", () => {
    render(<ConflictOverview {...defaultProps} />);

    expect(screen.getByText(/Unresolved/)).toBeInTheDocument();
    expect(screen.getByText(/Resolved/)).toBeInTheDocument();
  });

  it("shows the correct count of unresolved (2) and resolved (1)", () => {
    render(<ConflictOverview {...defaultProps} />);

    expect(screen.getByText(/Unresolved \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Resolved \(1\)/)).toBeInTheDocument();
  });

  it("highlights the active conflict", () => {
    const { container } = render(
      <ConflictOverview {...defaultProps} activeConflictId={1} />
    );

    const items = container.querySelectorAll(".overview-item");
    expect(items[0]).toHaveClass("overview-item--active");
    expect(items[1]).not.toHaveClass("overview-item--active");
    expect(items[2]).not.toHaveClass("overview-item--active");
  });

  it("calls onJumpTo when an unresolved conflict is clicked", async () => {
    const onJump = vi.fn();
    const user = userEvent.setup();
    render(<ConflictOverview {...defaultProps} onJumpTo={onJump} />);

    // Click the first unresolved conflict (Conflict 1)
    await user.click(screen.getByText("Conflict 1"));
    expect(onJump).toHaveBeenCalledWith(1);
  });

  it("calls onJumpTo when a resolved conflict is clicked", async () => {
    const onJump = vi.fn();
    const user = userEvent.setup();
    render(<ConflictOverview {...defaultProps} onJumpTo={onJump} />);

    // Click the resolved conflict (Conflict 2)
    await user.click(screen.getByText("Conflict 2"));
    expect(onJump).toHaveBeenCalledWith(2);
  });

  it("shows line ranges for each conflict", () => {
    render(<ConflictOverview {...defaultProps} />);

    expect(screen.getByText(/L2–6/)).toBeInTheDocument();
    expect(screen.getByText(/L10–14/)).toBeInTheDocument();
    expect(screen.getByText(/L20–24/)).toBeInTheDocument();
  });

  it("closes when clicking the backdrop", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ConflictOverview {...defaultProps} onClose={onClose} />
    );

    await user.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the panel", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConflictOverview {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText(/Conflict Overview/));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows empty state when no conflicts", () => {
    render(<ConflictOverview {...defaultProps} conflicts={[]} />);

    expect(screen.getByText(/No conflicts found/)).toBeInTheDocument();
  });
});
