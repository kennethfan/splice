import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MagicMergeDialog } from "./MagicMergeDialog";

describe("MagicMergeDialog", () => {
  const defaultProps = {
    autoResolved: 18,
    remaining: 5,
    filePath: "/path/to/file.ts",
    onUndo: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders with auto-resolved and remaining counts", () => {
    render(<MagicMergeDialog {...defaultProps} />);

    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/Auto-Resolved/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining/)).toBeInTheDocument();
  });

  it("shows the file path", () => {
    render(<MagicMergeDialog {...defaultProps} />);

    expect(screen.getByText("/path/to/file.ts")).toBeInTheDocument();
  });

  it("shows undo and continue buttons", () => {
    render(<MagicMergeDialog {...defaultProps} />);

    expect(screen.getByText(/Undo All/)).toBeInTheDocument();
    expect(screen.getByText(/Continue Resolving/)).toBeInTheDocument();
  });

  it("calls onUndo when undo button clicked", async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();
    render(<MagicMergeDialog {...defaultProps} onUndo={onUndo} />);

    await user.click(screen.getByText(/Undo All/));
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MagicMergeDialog {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText(/Continue Resolving/));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when clicking backdrop", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<MagicMergeDialog {...defaultProps} onClose={onClose} />);

    await user.click(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the dialog", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MagicMergeDialog {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText(/Magic Merge Complete/));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows 'All Conflicts Resolved!' when remaining is 0", () => {
    render(<MagicMergeDialog {...defaultProps} remaining={0} />);

    expect(screen.getByText(/All Conflicts Resolved!/)).toBeInTheDocument();
    expect(screen.getByText("🎉")).toBeInTheDocument();
  });

  it("shows Close button when remaining is 0", () => {
    render(<MagicMergeDialog {...defaultProps} remaining={0} />);

    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.queryByText(/Continue Resolving/)).not.toBeInTheDocument();
  });
});
