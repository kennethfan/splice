import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutsOverlay } from "./ShortcutsOverlay";

describe("ShortcutsOverlay", () => {
  it("renders nothing when closed", () => {
    const onClose = vi.fn();
    const { container } = render(
      <ShortcutsOverlay isOpen={false} onClose={onClose} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders shortcuts when open", () => {
    const onClose = vi.fn();
    render(<ShortcutsOverlay isOpen={true} onClose={onClose} />);

    // Header
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();

    // Groups
    expect(screen.getByText("Conflict Resolution")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("File")).toBeInTheDocument();
    expect(screen.getByText("Editing")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();

    // Specific shortcuts
    expect(screen.getByText("Accept local (yours)")).toBeInTheDocument();
    expect(screen.getByText("Next conflict")).toBeInTheDocument();
    expect(screen.getByText("Open file")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Toggle notification sound")).toBeInTheDocument();
    expect(screen.getByText("Toggle this help")).toBeInTheDocument();

    // Footer
    expect(screen.getByText(/Esc/)).toBeInTheDocument();
  });

  it("calls onClose when clicking the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <ShortcutsOverlay isOpen={true} onClose={onClose} />
    );

    // Click the backdrop (outermost div with shortcuts-backdrop class)
    const backdrop = container.querySelector(".shortcuts-backdrop");
    expect(backdrop).toBeInTheDocument();
    await user.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the × button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShortcutsOverlay isOpen={true} onClose={onClose} />);

    await user.click(screen.getByLabelText("Close shortcuts"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShortcutsOverlay isOpen={true} onClose={onClose} />);

    // Click the dialog itself (stops propagation)
    const dialog = screen.getByRole("dialog");
    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });
});
