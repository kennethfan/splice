import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
  const tabs = [
    { filePath: "/path/to/login.tsx" },
    { filePath: "/path/to/api/user.ts" },
    { filePath: "/path/to/types.ts" },
  ];

  const defaultProps = {
    tabs,
    activeIndex: 0,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onNewTab: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all tab names", () => {
    render(<TabBar {...defaultProps} />);

    expect(screen.getByText("login.tsx")).toBeInTheDocument();
    expect(screen.getByText("user.ts")).toBeInTheDocument();
    expect(screen.getByText("types.ts")).toBeInTheDocument();
  });

  it("highlights the active tab", () => {
    const { container } = render(<TabBar {...defaultProps} activeIndex={0} />);

    const tabs = container.querySelectorAll(".tab");
    expect(tabs[0]).toHaveClass("tab--active");
    expect(tabs[1]).not.toHaveClass("tab--active");
    expect(tabs[2]).not.toHaveClass("tab--active");
  });

  it("calls onSelect when a tab is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<TabBar {...defaultProps} onSelect={onSelect} />);

    await user.click(screen.getByText("user.ts"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TabBar {...defaultProps} onClose={onClose} />);

    // Find all close buttons and click the first one
    const closeButtons = screen.getAllByTitle("Close tab");
    await user.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledWith(0);
  });

  it("calls onNewTab when + button is clicked", async () => {
    const onNewTab = vi.fn();
    const user = userEvent.setup();
    render(<TabBar {...defaultProps} onNewTab={onNewTab} />);

    await user.click(screen.getByTitle("Open file (Cmd+O)"));
    expect(onNewTab).toHaveBeenCalledOnce();
  });

  it("renders new tab (+) button", () => {
    render(<TabBar {...defaultProps} />);

    expect(screen.getByText("+")).toBeInTheDocument();
  });
});
