import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboard } from "./useKeyboard";

describe("useKeyboard", () => {
  const handlers = {
    onNextConflict: vi.fn(),
    onPrevConflict: vi.fn(),
    onAcceptLocal: vi.fn(),
    onAcceptRemote: vi.fn(),
    onAcceptBoth: vi.fn(),
    onMagicMerge: vi.fn(),
    onSave: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenDirectory: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onToggleBasePanel: vi.fn(),
    onOpenOverview: vi.fn(),
    onCloseTab: vi.fn(),
  };

  function fireKey(key: string, meta = false, shift = false) {
    const event = new KeyboardEvent("keydown", {
      key,
      metaKey: meta,
      ctrlKey: meta,
      shiftKey: shift,
      bubbles: true,
    });
    // Prevent default handling so the event reaches the listener
    window.dispatchEvent(event);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onNextConflict on Tab", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("Tab");
    expect(handlers.onNextConflict).toHaveBeenCalledTimes(1);
  });

  it("calls onPrevConflict on Shift+Tab", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("Tab", false, true);
    expect(handlers.onPrevConflict).toHaveBeenCalledTimes(1);
  });

  it("calls onAcceptLocal on Cmd+'", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("'", true);
    expect(handlers.onAcceptLocal).toHaveBeenCalledTimes(1);
  });

  it("calls onAcceptRemote on Cmd+.", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey(".", true);
    expect(handlers.onAcceptRemote).toHaveBeenCalledTimes(1);
  });

  it("calls onMagicMerge on Cmd+m", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("m", true);
    expect(handlers.onMagicMerge).toHaveBeenCalledTimes(1);
  });

  it("calls onSave on Cmd+s", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("s", true);
    expect(handlers.onSave).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenFile on Cmd+o", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("o", true);
    expect(handlers.onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenDirectory on Cmd+Shift+O", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("O", true, true);
    expect(handlers.onOpenDirectory).toHaveBeenCalledTimes(1);
  });

  it("calls onUndo on Cmd+z", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("z", true);
    expect(handlers.onUndo).toHaveBeenCalledTimes(1);
  });

  it("calls onRedo on Cmd+Shift+z", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("z", true, true);
    expect(handlers.onRedo).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleBasePanel on Cmd+\\", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("\\", true);
    expect(handlers.onToggleBasePanel).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenOverview on Cmd+p", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("p", true);
    expect(handlers.onOpenOverview).toHaveBeenCalledTimes(1);
  });

  it("calls onCloseTab on Cmd+w", () => {
    renderHook(() => useKeyboard(handlers));
    fireKey("w", true);
    expect(handlers.onCloseTab).toHaveBeenCalledTimes(1);
  });

  it("ignores shortcuts when typing in an input element", () => {
    renderHook(() => useKeyboard(handlers));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // Dispatch the event on the input element itself
    // The hook checks e.target, and if it's an input, it returns early
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
    });
    input.dispatchEvent(event);

    expect(handlers.onNextConflict).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("cleans up event listener on unmount", () => {
    const { unmount } = renderHook(() => useKeyboard(handlers));
    unmount();

    fireKey("Tab");
    expect(handlers.onNextConflict).not.toHaveBeenCalled();
  });
});
