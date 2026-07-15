import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConflictBlock } from "./ConflictBlock";
import type { ConflictBlock as ConflictBlockType } from "../lib/tauri";

describe("ConflictBlock", () => {
  const baseBlock: ConflictBlockType = {
    id: 1,
    local_lines: ['return "Hello, " + name + "!";'],
    base_lines: null,
    remote_lines: ["return `Hi there, ${name}!`;"],
    status: "Unresolved",
    start_line: 2,
    end_line: 6,
  };

  it("renders conflict header with id and lines", () => {
    render(
      <ConflictBlock
        block={baseBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    expect(screen.getByText(/Conflict 1\/5/)).toBeInTheDocument();
    expect(screen.getByText(/Lines 2–6/)).toBeInTheDocument();
  });

  it("shows Yours and Theirs labels for unresolved conflict", () => {
    render(
      <ConflictBlock
        block={baseBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    expect(screen.getByText(/Yours:/)).toBeInTheDocument();
    expect(screen.getByText(/Theirs:/)).toBeInTheDocument();
  });

  it("renders action buttons for unresolved conflict", () => {
    render(
      <ConflictBlock
        block={baseBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    expect(screen.getByText(/← Use Yours/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /↔ Keep Both/ })).toBeInTheDocument();
    expect(screen.getByText(/Use Theirs →/)).toBeInTheDocument();
  });

  it("calls onResolve with Local when Use Yours is clicked", async () => {
    const onResolve = vi.fn();
    const user = userEvent.setup();

    render(
      <ConflictBlock
        block={baseBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={onResolve}
      />
    );

    await user.click(screen.getByText(/← Use Yours/));
    expect(onResolve).toHaveBeenCalledWith(1, "Local");
  });

  it("calls onResolve with Remote when Use Theirs is clicked", async () => {
    const onResolve = vi.fn();
    const user = userEvent.setup();

    render(
      <ConflictBlock
        block={baseBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={onResolve}
      />
    );

    await user.click(screen.getByText(/Use Theirs →/));
    expect(onResolve).toHaveBeenCalledWith(1, "Remote");
  });

  it("calls onResolve with Both when Keep Both is clicked", async () => {
    const onResolve = vi.fn();
    const user = userEvent.setup();

    render(
      <ConflictBlock
        block={baseBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={onResolve}
      />
    );

    await user.click(screen.getByRole("button", { name: /↔ Keep Both/ }));
    expect(onResolve).toHaveBeenCalledWith(1, "Both");
  });

  it("shows resolved state and hides action buttons when resolved", () => {
    const resolvedBlock: ConflictBlockType = {
      ...baseBlock,
      status: "ResolvedWithLocal",
    };

    render(
      <ConflictBlock
        block={resolvedBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    expect(screen.getByText(/✓ Resolved/)).toBeInTheDocument();
    expect(screen.queryByText(/← Use Yours/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use Theirs →/)).not.toBeInTheDocument();
  });

  it("shows active state styling when isActive is true", () => {
    const { container } = render(
      <ConflictBlock
        block={baseBlock}
        isActive={true}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    const block = container.querySelector(".conflict-block");
    expect(block).toHaveClass("conflict-block--active");
  });

  it("renders nothing when both local and remote are empty", () => {
    const emptyBlock: ConflictBlockType = {
      ...baseBlock,
      local_lines: [],
      remote_lines: [],
    };

    const { container } = render(
      <ConflictBlock
        block={emptyBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("shows resolved status text for different resolution types", () => {
    const statuses = [
      { status: "ResolvedWithLocal" as const, text: /Using your version/ },
      { status: "ResolvedWithRemote" as const, text: /Using their version/ },
      { status: "ResolvedWithBoth" as const, text: /Both versions kept/ },
    ];

    for (const { status, text } of statuses) {
      const block: ConflictBlockType = { ...baseBlock, status };
      render(
        <ConflictBlock
          block={block}
          isActive={false}
          index={1}
          total={5}
          onResolve={vi.fn()}
        />
      );
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("applies resolved CSS class when resolved", () => {
    const resolvedBlock: ConflictBlockType = {
      ...baseBlock,
      status: "ResolvedWithRemote",
    };

    const { container } = render(
      <ConflictBlock
        block={resolvedBlock}
        isActive={false}
        index={1}
        total={5}
        onResolve={vi.fn()}
      />
    );

    const block = container.querySelector(".conflict-block");
    expect(block).toHaveClass("conflict-block--resolved");
  });
});
