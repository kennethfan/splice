import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusBar, computeDiffStats } from "./StatusBar";
import type { MergeSession, BlockDiff } from "../lib/tauri";
import { setSoundMuted } from "../lib/sound";

function createMockSession(overrides: Partial<MergeSession> = {}): MergeSession {
  return {
    file_path: "/tmp/test.js",
    file_extension: "js",
    conflicts: [],
    all_local_content: "",
    all_remote_content: "",
    all_base_content: null,
    original_content: "",
    resolved_count: 0,
    total_count: 0,
    saved: false,
    undo_stack: [],
    redo_stack: [],
    ...overrides,
  };
}

function createMockDiffs(overrides: Partial<BlockDiff> = {}): BlockDiff[] {
  return [
    {
      local_vs_base: ["Unchanged" as const, "Modified" as const],
      remote_vs_base: ["Unchanged" as const, "Added" as const],
      local_word_changes: [
        [],
        [
          { text: "foo", status: "removed" as const },
          { text: "bar", status: "added" as const },
        ],
      ],
      remote_word_changes: [],
      ...overrides,
    },
  ];
}

describe("StatusBar", () => {
  // Reset module-level mute state between tests
  afterEach(() => {
    setSoundMuted(false);
  });

  const baseHandlers = {
    onPrevConflict: vi.fn(),
    onNextConflict: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onMagicMerge: vi.fn(),
    onSave: vi.fn(),
    onOpenFile: vi.fn(),
  };

  it("shows idle state when no session", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.getByText(/Open File/)).toBeInTheDocument();
    expect(screen.getByText(/git mergetool/)).toBeInTheDocument();
  });

  it("shows configure mergetool button when onConfigureMergetool is provided", () => {
    const onConfigureMergetool = vi.fn();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        onConfigureMergetool={onConfigureMergetool}
      />
    );

    // Button text is "⚙ Configure"
    expect(screen.getByText(/Configure/)).toBeInTheDocument();
  });

  it("does not show configure mergetool button when onConfigureMergetool is not provided", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.queryByText(/Configure/)).not.toBeInTheDocument();
  });

  it("calls onConfigureMergetool when the config button is clicked", async () => {
    const user = userEvent.setup();
    const onConfigureMergetool = vi.fn();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        onConfigureMergetool={onConfigureMergetool}
      />
    );

    await user.click(screen.getByText(/Configure/));
    expect(onConfigureMergetool).toHaveBeenCalledTimes(1);
  });

  it("shows auto-launch toggle button when onToggleAutoStart is provided", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        onToggleAutoStart={vi.fn()}
      />
    );

    // Off state: "🔕 Auto-Launch Off"
    expect(screen.getByText(/Auto-Launch Off/)).toBeInTheDocument();
    // On state should NOT be visible
    expect(screen.queryByText(/Auto-Launch On/)).not.toBeInTheDocument();
  });

  it("shows enabled state when autoStartEnabled is true", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        autoStartEnabled={true}
        onToggleAutoStart={vi.fn()}
      />
    );

    expect(screen.getByText(/Auto-Launch On/)).toBeInTheDocument();
  });

  it("does not show auto-launch toggle when onToggleAutoStart is not provided", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.queryByText(/Auto-Launch/)).not.toBeInTheDocument();
  });

  it("calls onToggleAutoStart when the auto-launch button is clicked", async () => {
    const user = userEvent.setup();
    const onToggleAutoStart = vi.fn();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        onToggleAutoStart={onToggleAutoStart}
      />
    );

    await user.click(screen.getByTitle(/Auto-launch Splice/));
    expect(onToggleAutoStart).toHaveBeenCalledTimes(1);
  });

  it("shows conflict progress when session is active", () => {
    const session = createMockSession({
      total_count: 5,
      resolved_count: 2,
      conflicts: Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        local_lines: ["line"],
        base_lines: null,
        remote_lines: ["line"],
        status: i < 2 ? ("ResolvedWithLocal" as const) : ("Unresolved" as const),
        start_line: i * 2 + 1,
        end_line: i * 2 + 3,
      })),
    });

    const { container } = render(
      <StatusBar
        session={session}
        diffs={null}
        currentIndex={1}
        canUndo={true}
        canRedo={false}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    // Progress text is in the left section (use class selector for specificity)
    const progressText = container.querySelector(".status-bar-progress-text");
    expect(progressText).toHaveTextContent("2/5");
    expect(screen.getByText("test.js")).toBeInTheDocument();
  });

  it("shows resolution breakdown badges", () => {
    const session = createMockSession({
      total_count: 4,
      resolved_count: 3,
      conflicts: [
        { id: 1, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "ResolvedWithLocal", start_line: 1, end_line: 3 },
        { id: 2, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "ResolvedWithRemote", start_line: 4, end_line: 6 },
        { id: 3, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "ResolvedWithBoth", start_line: 7, end_line: 9 },
        { id: 4, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "Unresolved", start_line: 10, end_line: 12 },
      ],
    });

    render(
      <StatusBar
        session={session}
        diffs={null}
        currentIndex={0}
        canUndo={true}
        canRedo={false}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.getByText(/← 1/)).toBeInTheDocument();
    expect(screen.getByText(/1 →/)).toBeInTheDocument();
    expect(screen.getByText(/↔ 1/)).toBeInTheDocument();
    expect(screen.getByText(/⚡ 1/)).toBeInTheDocument();
  });

  it("shows diff stats when diffs are available", () => {
    const diffs = createMockDiffs();

    render(
      <StatusBar
        session={createMockSession({ total_count: 1, conflicts: [{ id: 1, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "Unresolved", start_line: 1, end_line: 3 }] })}
        diffs={diffs}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.getByText(/\+1/)).toBeInTheDocument(); // 1 word added
    expect(screen.getByText(/\-1/)).toBeInTheDocument(); // 1 word removed
    expect(screen.getByText(/~1L/)).toBeInTheDocument(); // 1 line changed (max of local/remote)
  });

  it("shows all-resolved status when all conflicts resolved", () => {
    const session = createMockSession({
      total_count: 2,
      resolved_count: 2,
      conflicts: [
        { id: 1, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "ResolvedWithLocal", start_line: 1, end_line: 3 },
        { id: 2, local_lines: ["c"], base_lines: null, remote_lines: ["d"], status: "ResolvedWithRemote", start_line: 5, end_line: 7 },
      ],
    });

    render(
      <StatusBar
        session={session}
        diffs={null}
        currentIndex={0}
        canUndo={true}
        canRedo={true}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.getByText(/2\/2/)).toBeInTheDocument();
  });

  it("calls onResolve callbacks when buttons are clicked", async () => {
    const user = userEvent.setup();
    const session = createMockSession({ total_count: 3, conflicts: Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      local_lines: ["a"],
      base_lines: null,
      remote_lines: ["b"],
      status: "Unresolved" as const,
      start_line: i * 2 + 1,
      end_line: i * 2 + 3,
    }))});

    render(
      <StatusBar
        session={session}
        diffs={null}
        currentIndex={1}
        canUndo={true}
        canRedo={true}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    await user.click(screen.getByTitle(/Undo/));
    expect(baseHandlers.onUndo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTitle(/Redo/));
    expect(baseHandlers.onRedo).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTitle(/Previous conflict/));
    expect(baseHandlers.onPrevConflict).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTitle(/Next conflict/));
    expect(baseHandlers.onNextConflict).toHaveBeenCalledTimes(1);
  });

  it("shows loading indicator when loading", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={true}
        {...baseHandlers}
      />
    );

    // Loading shows ◌ indicator
    expect(screen.getByText("◌")).toBeInTheDocument();
  });

  it("shows saved state after save", () => {
    const session = createMockSession({ total_count: 1, saved: true, conflicts: [{ id: 1, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "ResolvedWithLocal", start_line: 1, end_line: 3 }], resolved_count: 1 });

    render(
      <StatusBar
        session={session}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.getByText(/✓ Saved/)).toBeInTheDocument();
    const saveBtn = screen.getByText(/✓ Saved/);
    expect(saveBtn).toBeDisabled();
  });

  it("shows 📂 add-repo button when onAddWatchedRepo is provided", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        onAddWatchedRepo={vi.fn()}
      />
    );

    expect(screen.getByTitle(/Select a git repository/)).toBeInTheDocument();
    expect(screen.queryByTitle(/Stop watcher/)).not.toBeInTheDocument();
  });

  it("shows stop button when watcher is running with onStopWatcher", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        watcherRunning={true}
        watchedRepoCount={2}
        onAddWatchedRepo={vi.fn()}
        onStopWatcher={vi.fn()}
      />
    );

    expect(screen.getByTitle(/Stop watcher/)).toBeInTheDocument();
    expect(screen.getByTitle(/Add another repo/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not show watcher UI when onAddWatchedRepo is not provided", () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.queryByTitle(/Select a git repository/)).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Add another repo/)).not.toBeInTheDocument();
  });

  it("calls onAddWatchedRepo when the 📂 button is clicked", async () => {
    const user = userEvent.setup();
    const onAddWatchedRepo = vi.fn();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        onAddWatchedRepo={onAddWatchedRepo}
      />
    );

    await user.click(screen.getByTitle(/Select a git repository/));
    expect(onAddWatchedRepo).toHaveBeenCalledTimes(1);
  });

  it("calls onStopWatcher when the ⏹ button is clicked", async () => {
    const user = userEvent.setup();
    const onStopWatcher = vi.fn();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        watcherRunning={true}
        watchedRepoCount={1}
        onAddWatchedRepo={vi.fn()}
        onStopWatcher={onStopWatcher}
      />
    );

    await user.click(screen.getByTitle(/Stop watcher/));
    expect(onStopWatcher).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenWatcherPanel when the count badge is clicked", async () => {
    const user = userEvent.setup();
    const onOpenWatcherPanel = vi.fn();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
        watcherRunning={true}
        watchedRepoCount={3}
        onAddWatchedRepo={vi.fn()}
        onStopWatcher={vi.fn()}
        onOpenWatcherPanel={onOpenWatcherPanel}
      />
    );

    // The count badge shows the number
    const badge = screen.getByText("3");
    expect(badge).toBeInTheDocument();
    await user.click(badge);
    expect(onOpenWatcherPanel).toHaveBeenCalledTimes(1);
  });

  it("shows sound toggle button and toggles on click", async () => {
    const user = userEvent.setup();
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    // Starts unmuted — shows 🔔
    const btn = screen.getByTitle(/Mute notification sound/);
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("🔔");

    // Click to mute
    await user.click(btn);
    expect(screen.getByTitle(/Unmute notification sound/)).toBeInTheDocument();
    expect(screen.getByTitle(/Unmute notification sound/)).toHaveTextContent("🔇");

    // Click again to unmute
    await user.click(screen.getByTitle(/Unmute notification sound/));
    expect(screen.getByTitle(/Mute notification sound/)).toBeInTheDocument();
  });

  it("reset button reverts sound to unmuted and shows toast", async () => {
    const user = userEvent.setup();
    // Mock window.confirm to return true (user confirms reset)
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    // First mute the sound
    const muteBtn = screen.getByTitle(/Mute notification sound/);
    await user.click(muteBtn);
    expect(screen.getByTitle(/Unmute notification sound/)).toHaveTextContent("🔇");

    // Click reset — should revert to unmuted
    const resetBtn = screen.getByTitle(/Reset all settings/);
    window.confirm = vi.fn(() => true);
    await user.click(resetBtn);
    expect(screen.getByTitle(/Mute notification sound/)).toHaveTextContent("🔔");

    // Toast should appear briefly
    expect(screen.getByText(/Settings reset/)).toBeInTheDocument();

    // Restore original confirm
    window.confirm = originalConfirm;
  });

  it("toggles sound with Cmd+Shift+M keyboard shortcut", async () => {
    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    // Starts unmuted — shows 🔔
    expect(screen.getByTitle(/Mute notification sound/)).toHaveTextContent("🔔");

    // Press Cmd+Shift+M to mute
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "m",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTitle(/Unmute notification sound/)).toHaveTextContent("🔇");
    });

    // Press Cmd+Shift+M again to unmute
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "M",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTitle(/Mute notification sound/)).toHaveTextContent("🔔");
    });
  });

  it("triggers reset with Cmd+Shift+R keyboard shortcut", async () => {
    const originalConfirm = window.confirm;
    window.confirm = vi.fn(() => true);

    render(
      <StatusBar
        session={null}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={false}
        loading={false}
        {...baseHandlers}
      />
    );

    // First mute the sound so we can verify reset reverts it
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "m",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTitle(/Unmute notification sound/)).toHaveTextContent("🔇");
    });

    // Press Cmd+Shift+R to reset
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "r",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      }));
    });
    await waitFor(() => {
      expect(screen.getByTitle(/Mute notification sound/)).toHaveTextContent("🔔");
    });
    expect(screen.getByText(/Settings reset/)).toBeInTheDocument();

    window.confirm = originalConfirm;
  });

  it("disables prev/next at boundaries", () => {
    const session = createMockSession({ total_count: 1, conflicts: [{ id: 1, local_lines: ["a"], base_lines: null, remote_lines: ["b"], status: "Unresolved", start_line: 1, end_line: 3 }] });

    render(
      <StatusBar
        session={session}
        diffs={null}
        currentIndex={0}
        canUndo={false}
        canRedo={false}
        hasSession={true}
        loading={false}
        {...baseHandlers}
      />
    );

    expect(screen.getByTitle(/Previous conflict/)).toBeDisabled();
    expect(screen.getByTitle(/Next conflict/)).toBeDisabled();
  });
});

describe("computeDiffStats", () => {
  it("returns zeros for empty diffs", () => {
    const stats = computeDiffStats([]);
    expect(stats).toEqual({ linesChanged: 0, wordsAdded: 0, wordsRemoved: 0 });
  });

  it("counts Modified and Added lines without double counting", () => {
    const diffs: BlockDiff[] = [
      {
        local_vs_base: ["Unchanged", "Modified", "Unchanged"],
        remote_vs_base: ["Unchanged", "Added", "Unchanged"],
        local_word_changes: [],
        remote_word_changes: [],
      },
    ];
    const stats = computeDiffStats(diffs);
    // Both local and remote mark position 1 as changed, but it's one logical line
    expect(stats.linesChanged).toBe(1);
  });

  it("counts word additions and removals", () => {
    const diffs: BlockDiff[] = [
      {
        local_vs_base: ["Modified"],
        remote_vs_base: ["Unchanged"],
        local_word_changes: [[
          { text: "foo", status: "removed" },
          { text: "bar", status: "added" },
        ]],
        remote_word_changes: [],
      },
    ];
    const stats = computeDiffStats(diffs);
    expect(stats.linesChanged).toBe(1);
    expect(stats.wordsAdded).toBe(1);
    expect(stats.wordsRemoved).toBe(1);
  });
});
