import { useState, useEffect, useCallback, useRef } from "react";
import type { BlockDiff } from "../lib/tauri";
import { computeDiffs } from "../lib/tauri";

/**
 * Hook that fetches word-level diffs for the active session.
 * Re-fetches when filePath changes (a new session was loaded).
 * Returns a Map<conflictId, BlockDiff> for O(1) lookups by conflict block.
 */
export function useBlockDiffs(
  filePath: string | null,
  conflictCount: number,
) {
  const [diffs, setDiffs] = useState<BlockDiff[] | null>(null);
  const [loading, setLoading] = useState(false);
  const prevKeyRef = useRef<string>("");
  const requestIdRef = useRef(0);

  const fetchDiffs = useCallback(async () => {
    if (!filePath || conflictCount === 0) {
      setDiffs(null);
      return;
    }

    const key = `${filePath}::${conflictCount}`;
    if (key === prevKeyRef.current && diffs !== null) {
      return; // already fetched for this session
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await computeDiffs(filePath);
      // Guard against stale responses — discard if a newer fetch was started
      if (requestId !== requestIdRef.current) return;
      setDiffs(result);
      prevKeyRef.current = key;
    } catch {
      setDiffs(null);
    } finally {
      setLoading(false);
    }
  }, [filePath, conflictCount]);

  useEffect(() => {
    fetchDiffs();
  }, [fetchDiffs]);

  const getDiffForBlock = useCallback(
    (blockIndex: number): BlockDiff | null => {
      if (!diffs || blockIndex < 0 || blockIndex >= diffs.length) return null;
      return diffs[blockIndex];
    },
    [diffs],
  );

  // Allow manual refresh (e.g. after resolve changes content)
  const refresh = useCallback(() => {
    prevKeyRef.current = "";
    fetchDiffs();
  }, [fetchDiffs]);

  return { diffs, loading, getDiffForBlock, refresh };
}
