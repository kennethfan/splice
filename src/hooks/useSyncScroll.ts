import { useRef, useCallback } from "react";

export interface PaneRefs {
  left: React.RefObject<HTMLDivElement | null>;
  center: React.RefObject<HTMLDivElement | null>;
  right: React.RefObject<HTMLDivElement | null>;
  base: React.RefObject<HTMLDivElement | null>;
}

type PaneName = "left" | "center" | "right" | "base";

/**
 * Synchronizes scroll positions across panes proportionally.
 * Supports 3-pane (left, center, right) and 4-pane (with base) layouts.
 *
 * Uses requestAnimationFrame throttling + a programmatic scroll guard
 * to prevent cascading feedback loops between panes.
 */
export function useSyncScroll() {
  const refs: PaneRefs = {
    left: useRef<HTMLDivElement | null>(null),
    center: useRef<HTMLDivElement | null>(null),
    right: useRef<HTMLDivElement | null>(null),
    base: useRef<HTMLDivElement | null>(null),
  };

  /**
   * Flag set to true before any programmatic scrollTop / scrollIntoView
   * changes. handleScroll checks this to ignore scroll events that were
   * triggered by our own code (not user input). Cleared asynchronously
   * after the browser has processed the resulting scroll events.
   */
  const programmaticScrollRef = useRef(false);

  const rafId = useRef<number | null>(null);
  const pendingSource = useRef<PaneName | null>(null);

  /**
   * Capture the current ratio of the source pane and schedule a sync.
   * The ratio is captured IMMEDIATELY (not in RAF) so later programmatic
   * scroll events from other panes capture a different (already synced)
   * ratio and are discarded.
   */
  const handleScroll = useCallback((source: PaneName) => {
    // Ignore scroll events triggered by our own programmatic changes
    if (programmaticScrollRef.current) return;

    const sourcePane = refs[source].current;
    if (!sourcePane) return;

    // Store the latest source and debounce via RAF
    pendingSource.current = source;

    if (rafId.current !== null) {
      // Already have a pending frame — just update the source
      return;
    }

    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;

      // Use the latest pending source (handles rapid scrolling across panes)
      const src = pendingSource.current;
      pendingSource.current = null;
      if (!src) return;

      // Re-capture ratio from the actual source (handles stale captures)
      const srcPane = refs[src].current;
      if (!srcPane) return;
      const srcMax = srcPane.scrollHeight - srcPane.clientHeight;
      const effectiveRatio = srcMax > 0 ? srcPane.scrollTop / srcMax : 0;

      // Mark as programmatic before touching scrollTop
      programmaticScrollRef.current = true;

      for (const [key, ref] of Object.entries(refs)) {
        if (key !== src && ref.current) {
          const targetMax = ref.current.scrollHeight - ref.current.clientHeight;
          ref.current.scrollTop = effectiveRatio * targetMax;
        }
      }

      // Clear the programmatic flag after one more frame so that any
      // scroll events triggered by the scrollTop changes above have
      // been dispatched and consumed with the guard active.
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
  }, []);

  return { refs, handleScroll, programmaticScrollRef };
}
