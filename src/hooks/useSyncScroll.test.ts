import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSyncScroll } from "./useSyncScroll";

describe("useSyncScroll", () => {
  // The hook now uses requestAnimationFrame for throttling, so we need
  // fake timers to trigger RAF callbacks synchronously in tests.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockElement(scrollHeight = 200, clientHeight = 100) {
    const el = document.createElement("div");
    Object.defineProperties(el, {
      scrollHeight: { value: scrollHeight, writable: true },
      clientHeight: { value: clientHeight, writable: true },
      scrollTop: { value: 0, writable: true },
    });
    return el;
  }

  /// Advance fake timers enough to trigger both RAF frames:
  /// RAF 1: scheduled by handleScroll, runs syncAllFrom
  /// RAF 2: nested, clears programmaticScrollRef
  function flushRAF() {
    act(() => {
      vi.advanceTimersByTime(50);
    });
  }

  it("returns refs and handleScroll", () => {
    const { result } = renderHook(() => useSyncScroll());
    expect(result.current.refs).toHaveProperty("left");
    expect(result.current.refs).toHaveProperty("center");
    expect(result.current.refs).toHaveProperty("right");
    expect(result.current.refs).toHaveProperty("base");
    expect(result.current.handleScroll).toBeInstanceOf(Function);
    expect(result.current.programmaticScrollRef).toBeDefined();
  });

  it("syncs two panes proportionally", () => {
    const { result } = renderHook(() => useSyncScroll());

    // Set up refs with mock scrollable elements
    const source = createMockElement(200, 100); // maxScroll = 100
    const target = createMockElement(300, 100); // maxScroll = 200

    (result.current.refs.left as any).current = source;
    (result.current.refs.center as any).current = target;

    // Scroll source to 50%
    source.scrollTop = 50;

    act(() => {
      result.current.handleScroll("left");
    });

    flushRAF();

    // Target should be at 50% of its max: 0.5 * 200 = 100
    expect(target.scrollTop).toBe(100);
  });

  it("handles zero max scroll (no overflow)", () => {
    const { result } = renderHook(() => useSyncScroll());

    const source = createMockElement(100, 100); // maxScroll = 0
    const target = createMockElement(200, 100); // maxScroll = 100

    (result.current.refs.left as any).current = source;
    (result.current.refs.center as any).current = target;

    source.scrollTop = 0;

    act(() => {
      result.current.handleScroll("left");
    });

    flushRAF();

    // No overflow on source, target should be 0
    expect(target.scrollTop).toBe(0);
  });

  it("syncs base pane along with the others", () => {
    const { result } = renderHook(() => useSyncScroll());

    const source = createMockElement(200, 100);
    const base = createMockElement(400, 100);
    const center = createMockElement(200, 100);
    const right = createMockElement(200, 100);

    (result.current.refs.left as any).current = source;
    (result.current.refs.base as any).current = base;
    (result.current.refs.center as any).current = center;
    (result.current.refs.right as any).current = right;

    source.scrollTop = 50; // 50% of max (100)

    act(() => {
      result.current.handleScroll("left");
    });

    flushRAF();

    // Base max = 300, 50% = 150
    expect(base.scrollTop).toBe(150);
    // Center max = 100, 50% = 50
    expect(center.scrollTop).toBe(50);
    // Right max = 100, 50% = 50
    expect(right.scrollTop).toBe(50);
  });

  it("syncs from center to left pane", () => {
    const { result } = renderHook(() => useSyncScroll());

    const pane1 = createMockElement(200, 100);
    const pane2 = createMockElement(200, 100);

    (result.current.refs.left as any).current = pane1;
    (result.current.refs.center as any).current = pane2;

    pane2.scrollTop = 50;

    act(() => {
      result.current.handleScroll("center");
    });

    flushRAF();

    // pane1 should be synced to 50% of its max (100 * 0.5 = 50)
    expect(pane1.scrollTop).toBe(50);
  });

  it("ignores programmatic scroll events when guard is active", () => {
    const { result } = renderHook(() => useSyncScroll());

    const source = createMockElement(200, 100); // maxScroll = 100
    const target = createMockElement(300, 100); // maxScroll = 200

    (result.current.refs.left as any).current = source;
    (result.current.refs.center as any).current = target;

    source.scrollTop = 50;

    // Set the programmatic guard — simulate our own code changing scroll
    result.current.programmaticScrollRef.current = true;

    act(() => {
      result.current.handleScroll("left");
    });

    flushRAF();

    // Target should NOT be synced because programmaticScrollRef was active
    expect(target.scrollTop).toBe(0);
  });

  it("handles rapid scrolls from different panes", () => {
    const { result } = renderHook(() => useSyncScroll());

    const leftPane = createMockElement(200, 100); // maxScroll = 100
    const centerPane = createMockElement(200, 100); // maxScroll = 100
    const rightPane = createMockElement(300, 100); // maxScroll = 200

    (result.current.refs.left as any).current = leftPane;
    (result.current.refs.center as any).current = centerPane;
    (result.current.refs.right as any).current = rightPane;

    leftPane.scrollTop = 25; // 25%
    centerPane.scrollTop = 50; // 50% — latest scroll wins

    // Rapid scrolling: left, then center, before any RAF fires
    act(() => {
      result.current.handleScroll("left");
    });
    act(() => {
      result.current.handleScroll("center");
    });

    flushRAF();

    // The latest source (center at 50%) should determine the sync:
    // rightPane max = 200, 50% = 100
    expect(rightPane.scrollTop).toBe(100);
    // leftPane max = 100, 50% = 50
    expect(leftPane.scrollTop).toBe(50);
  });
});
