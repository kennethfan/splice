import { useRef, useCallback } from "react";

export interface PaneRefs {
  left: React.RefObject<HTMLDivElement | null>;
  center: React.RefObject<HTMLDivElement | null>;
  right: React.RefObject<HTMLDivElement | null>;
}

/**
 * Synchronizes scroll positions across three panes proportionally.
 */
export function useSyncScroll() {
  const refs: PaneRefs = {
    left: useRef<HTMLDivElement | null>(null),
    center: useRef<HTMLDivElement | null>(null),
    right: useRef<HTMLDivElement | null>(null),
  };

  const scrolling = useRef<string | null>(null);

  const handleScroll = useCallback((source: "left" | "center" | "right") => {
    if (scrolling.current) return; // prevent infinite loop
    scrolling.current = source;

    const sourcePane = refs[source].current;
    if (!sourcePane) {
      scrolling.current = null;
      return;
    }

    const maxScroll = sourcePane.scrollHeight - sourcePane.clientHeight;
    const ratio = maxScroll > 0 ? sourcePane.scrollTop / maxScroll : 0;

    for (const [key, ref] of Object.entries(refs)) {
      if (key !== source && ref.current) {
        const targetMax = ref.current.scrollHeight - ref.current.clientHeight;
        ref.current.scrollTop = ratio * targetMax;
      }
    }

    scrolling.current = null;
  }, []);

  return { refs, handleScroll };
}
