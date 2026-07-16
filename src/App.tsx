import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import "./styles/splice.css";
import { StatusBar } from "./components/StatusBar";
import { MagicMergeDialog } from "./components/MagicMergeDialog";
import { ConflictOverview } from "./components/ConflictOverview";
import { ManualResolveDialog } from "./components/ManualResolveDialog";
import { BasePane } from "./components/BasePane";
import { TabBar } from "./components/TabBar";
import { WatchedRepoPanel } from "./components/WatchedRepoPanel";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { useSyncScroll } from "./hooks/useSyncScroll";
import { useKeyboard } from "./hooks/useKeyboard";
import { open } from "@tauri-apps/plugin-dialog";
import type { MergeSession, ResolveAction, ConflictBlock } from "./lib/tauri";
import {
  openFile as openFileViaTauri,
  resolveConflict,
  magicMerge,
  saveFile,
  closeSession,
  undo as undoViaTauri,
  redo as redoViaTauri,
  configureMergetool,
  installConflictHook,
  uninstallConflictHook,
  getConflictHookStatus,
  startWatcher,
  stopWatcher,
  addWatchedRepo,
  removeWatchedRepo,
  getWatcherStatus,
  getWatchedRepoDetails,
  getInitialSession,
} from "./lib/tauri";
import { listen } from "@tauri-apps/api/event";
import type { ConflictDetectedPayload, WatchedRepoDetail } from "./lib/tauri";
import { highlightLines } from "./lib/highlight";
import { playConflictChime } from "./lib/sound";
import { useBlockDiffs } from "./hooks/useBlockDiffs";

interface TabData {
  filePath: string;
  session: MergeSession;
}

function App() {
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [activeConflictIndex, setActiveConflictIndex] = useState(0);
  const [showBase, setShowBase] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [magicResult, setMagicResult] = useState<{
    autoResolved: number;
    remaining: number;
    filePath: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [watcherRunning, setWatcherRunning] = useState(false);
  const [watchedRepoCount, setWatchedRepoCount] = useState(0);
  const [showWatcherPanel, setShowWatcherPanel] = useState(false);
  const [watchedRepoDetails, setWatchedRepoDetails] = useState<WatchedRepoDetail[]>([]);
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);
  const [highlightedFiles, setHighlightedFiles] = useState<Record<string, Set<string>>>({});
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isMergetoolMode, setIsMergetoolMode] = useState(false);
  const [manualEditConflict, setManualEditConflict] = useState<ConflictBlock | null>(null);

  // Ref to avoid stale activeTabIndex in async callbacks
  const activeTabIndexRef = useRef(activeTabIndex);
  activeTabIndexRef.current = activeTabIndex;
  // Ref to prevent double-loading in React StrictMode
  const initialSessionLoadedRef = useRef(false);
  // Track which side has been used for each conflict (one click per side)
  const usedSides = useRef<Set<string>>(new Set());

  // Active tab / session helpers
  const activeTab = tabs[activeTabIndex] ?? null;
  const session = activeTab?.session ?? null;
  const activeFilePath = activeTab?.filePath ?? "";

  // Reset usedSides and close manual dialog when switching to a different file
  useEffect(() => {
    usedSides.current.clear();
    setManualEditConflict(null);
  }, [activeFilePath]);

  const debugInfo = session ? {
    localLen: session.all_local_content?.length ?? 0,
    remoteLen: session.all_remote_content?.length ?? 0,
    baseLen: session.all_base_content?.length ?? 0,
    originalLen: session.original_content?.length ?? 0,
    conflictCount: session.conflicts?.length ?? 0,
  } : null;

  const { refs, handleScroll, programmaticScrollRef } = useSyncScroll();

  // Memoized syntax-highlighted lines for each pane
  const highlightedLocal = useMemo(
    () =>
      session
        ? highlightLines(session.all_local_content, session.file_extension)
        : [],
    [session?.all_local_content, session?.file_extension]
  );

  const highlightedRemote = useMemo(
    () =>
      session
        ? highlightLines(session.all_remote_content, session.file_extension)
        : [],
    [session?.all_remote_content, session?.file_extension]
  );

  const highlightedBase = useMemo(
    () =>
      session?.all_base_content
        ? highlightLines(session.all_base_content, session.file_extension)
        : [],
    [session?.all_base_content, session?.file_extension]
  );

  // Fetch word-level diffs for the active session
  const { diffs } = useBlockDiffs(
    activeFilePath,
    session?.conflicts.length ?? 0,
  );

  // Filter to unresolved conflicts for navigation
  const unresolvedIndices = session
    ? session.conflicts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.status === "Unresolved")
        .map(({ i }) => i)
    : [];

  const currentConflictIndex = unresolvedIndices.length > 0
    ? Math.min(activeConflictIndex, unresolvedIndices.length - 1)
    : -1;

  const currentConflictId = currentConflictIndex >= 0 && unresolvedIndices[currentConflictIndex] !== undefined
    ? session?.conflicts[unresolvedIndices[currentConflictIndex]]?.id ?? 0
    : 0;

  // Helper to update the active session in the tabs array using ref'd index
  const updateActiveSession = useCallback(
    (updated: MergeSession) => {
      const idx = activeTabIndexRef.current;
      setTabs((prev) => {
        const next = [...prev];
        if (next[idx]) {
          next[idx] = { ...next[idx], session: updated };
        }
        return next;
      });
    },
    []
  );

  // Switch to a specific tab
  const handleSelectTab = useCallback((index: number) => {
    setActiveTabIndex(index);
    setActiveConflictIndex(0);
    setShowOverview(false);
  }, []);

  // Close a tab and clean up backend session
  const handleCloseTab = useCallback(
    async (index: number) => {
      const tab = tabs[index];
      if (!tab) return;

      try {
        await closeSession(tab.filePath);
      } catch {
        // Ignore close errors
      }

      // Compute new tabs array
      const newTabs = tabs.filter((_, i) => i !== index);
      setTabs(newTabs);

      // Adjust active tab index
      if (newTabs.length === 0) {
        setActiveTabIndex(0);
      } else if (index <= activeTabIndex) {
        setActiveTabIndex((prev) => Math.max(0, prev - 1));
      }
    },
    [tabs, activeTabIndex]
  );

  // Open file dialog via Tauri native dialog
  const handleOpenFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        title: "Open Conflicted File",
        filters: [
          {
            name: "All Files",
            extensions: ["*"],
          },
        ],
      });
      if (!selected) {
        setLoading(false);
        return;
      }

      // Check if this file is already open
      const existing = tabs.findIndex((t) => t.filePath === selected);
      if (existing >= 0) {
        setActiveTabIndex(existing);
        setActiveConflictIndex(0);
        setLoading(false);
        return;
      }

      const result = await openFileViaTauri(selected);
      setTabs((prev) => [...prev, { filePath: selected, session: result }]);
      setActiveTabIndex(tabs.length);
      setActiveConflictIndex(0);
      // Auto-add the file's repo to the conflict watcher
      if (watcherRunning) {
        try {
          let dir = selected.substring(0, selected.lastIndexOf("/"));
          let found = false;
          while (dir.length > 0 && !found) {
            try {
              const repoStatus = await addWatchedRepo(dir);
              setWatchedRepoCount(repoStatus.watched_repos.length);
              found = true;
            } catch {
              const nextSep = dir.lastIndexOf("/");
              if (nextSep <= 0) break;
              dir = dir.substring(0, nextSep);
            }
          }
        } catch {
          // Failed to find a repo root — silently ignore
        }
      }
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, [tabs]);

  // Resolve a conflict
  const handleResolve = useCallback(
    async (conflictId: number, action: ResolveAction) => {
      if (!session) return;
      try {
        const updated = await resolveConflict(activeFilePath, conflictId, action);
        updateActiveSession(updated);
      } catch (err) {
        setError(String(err));
        throw err; // re-throw so callers (e.g. side pane buttons) know it failed
      }
    },
    [session, activeFilePath, updateActiveSession]
  );

  // Navigate to next conflict — also increments scroll counter to ensure
  // the scroll effect fires even when index stays the same (single conflict)
  const handleNextConflict = useCallback(() => {
    if (unresolvedIndices.length <= 0) return;
    setActiveConflictIndex((prev) => Math.min(prev + 1, unresolvedIndices.length - 1));
    setScrollCounter((c) => c + 1);
  }, [unresolvedIndices.length]);

  // Navigate to previous conflict
  const handlePrevConflict = useCallback(() => {
    if (unresolvedIndices.length <= 0) return;
    setActiveConflictIndex((prev) => Math.max(prev - 1, 0));
    setScrollCounter((c) => c + 1);
  }, [unresolvedIndices.length]);

  // Magic merge
  const handleMagicMerge = useCallback(async () => {
    if (!session) return;
    try {
      const updated = await magicMerge(activeFilePath);
      const beforeTotal = session.total_count;
      const afterResolved = updated.resolved_count;
      const autoResolved = afterResolved - session.resolved_count;
      const remaining = beforeTotal - afterResolved;
      updateActiveSession(updated);
      setMagicResult({
        autoResolved,
        remaining,
        filePath: updated.file_path,
      });
    } catch (err) {
      setError(String(err));
    }
  }, [session, activeFilePath, updateActiveSession]);

  // Undo magic merge (re-open file)
  const handleUndoMagic = useCallback(async () => {
    if (!session) return;
    setMagicResult(null);
    try {
      const fresh = await openFileViaTauri(session.file_path);
      updateActiveSession(fresh);
    } catch (err) {
      setError(String(err));
    }
  }, [session, updateActiveSession]);

  // Close magic result dialog
  const handleCloseMagic = useCallback(() => {
    setMagicResult(null);
  }, []);

  // Jump to a conflict by id (from overview sidebar)
  const handleJumpToConflict = useCallback(
    (conflictId: number) => {
      if (!session) return;
      const idx = session.conflicts.findIndex((c) => c.id === conflictId);
      if (idx >= 0) {
        const unresolvedPos = session.conflicts
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c.status === "Unresolved")
          .findIndex(({ i }) => i === idx);
        if (unresolvedPos >= 0) {
          setActiveConflictIndex(unresolvedPos);
        }
      }
      setShowOverview(false);
    },
    [session]
  );

  // Save
  const handleSave = useCallback(async () => {
    if (!session) return;
    try {
      await saveFile(activeFilePath);
      updateActiveSession({ ...session, saved: true });
    } catch (err) {
      setError(String(err));
    }
  }, [session, activeFilePath, updateActiveSession]);

  // Accept local/remote/both for current conflict
  const handleAcceptLocal = useCallback(async () => {
    if (currentConflictId > 0) {
      await handleResolve(currentConflictId, "Local");
      handleNextConflict();
    }
  }, [currentConflictId, handleResolve, handleNextConflict]);

  const handleAcceptRemote = useCallback(async () => {
    if (currentConflictId > 0) {
      await handleResolve(currentConflictId, "Remote");
      handleNextConflict();
    }
  }, [currentConflictId, handleResolve, handleNextConflict]);

  const handleAcceptBoth = useCallback(async () => {
    if (currentConflictId > 0) {
      await handleResolve(currentConflictId, "Both");
      handleNextConflict();
    }
  }, [currentConflictId, handleResolve, handleNextConflict]);

  const handleUndo = useCallback(async () => {
    if (!session) return;
    try {
      const updated = await undoViaTauri(activeFilePath);
      updateActiveSession(updated);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("Nothing to undo")) {
        // Silently ignore — nothing to undo
      } else {
        setError(msg);
      }
    }
  }, [session, activeFilePath, updateActiveSession]);

  const handleRedo = useCallback(async () => {
    if (!session) return;
    try {
      const updated = await redoViaTauri(activeFilePath);
      updateActiveSession(updated);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("Nothing to redo")) {
        // Silently ignore
      } else {
        setError(msg);
      }
    }
  }, [session, activeFilePath, updateActiveSession]);

  const handleToggleBase = useCallback(() => {
    if (!session) return;
    setShowBase((prev) => !prev);
  }, [session]);

  const handleOpenOverview = useCallback(() => {
    if (session) setShowOverview((prev) => !prev);
  }, [session]);

  const handleToggleDebug = useCallback(() => {
    setShowDebug((prev) => !prev);
  }, []);

  // Configure git mergetool
  const handleConfigureMergetool = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cmd = await configureMergetool();
      setError(`✅ Git mergetool configured! Cmd: ${cmd}`);
      // Auto-dismiss success after 5 seconds
      setTimeout(() => setError(null), 5000);
    } catch (err) {
      setError(`⚠️ ${err}`);
    }
    setLoading(false);
  }, []);

  // Auto-start toggle: install/uninstall conflict hooks
  const handleToggleAutoStart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (autoStartEnabled) {
        await uninstallConflictHook();
        setAutoStartEnabled(false);
        setError("🛑 Conflict auto-launch disabled");
      } else {
        const hooksPath = await installConflictHook();
        setAutoStartEnabled(true);
        setError(`✅ Auto-launch enabled! Hooks installed at ${hooksPath}`);
      }
      setTimeout(() => setError(null), 5000);
    } catch (err) {
      setError(`⚠️ ${err}`);
    }
    setLoading(false);
  }, [autoStartEnabled]);

  // Watcher: open folder picker to add a repo to the watch list
  const handleAddWatchedRepo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Open native directory picker
      const selected = await open({
        multiple: false,
        directory: true,
        title: "Select Git Repository to Watch",
      });
      if (!selected) {
        setLoading(false);
        return;
      }

      // If watcher isn't running, start it first
      if (!watcherRunning) {
        const status = await startWatcher();
        setWatcherRunning(true);
        setWatchedRepoCount(status.watched_repos.length);
      }

      // Add the selected repo
      const status = await addWatchedRepo(selected);
      setWatchedRepoCount(status.watched_repos.length);
      const repoName = selected.split("/").pop() || selected;
      setError(`✅ Watching ${repoName} (${status.watched_repos.length} repo(s) tracked)`);
      setTimeout(() => setError(null), 5000);
    } catch (err) {
      setError(`⚠️ ${err}`);
    }
    setLoading(false);
  }, [watcherRunning]);

  // Watcher: open the manage panel
  const handleOpenWatcherPanel = useCallback(async () => {
    setShowWatcherPanel(true);
    // Fetch fresh repo details
    try {
      const details = await getWatchedRepoDetails();
      setWatchedRepoDetails(details.repos);
      setWatchedRepoCount(details.repos.length);
    } catch {
      // Silently ignore
    }
  }, []);

  // Watcher: close the manage panel
  const handleCloseWatcherPanel = useCallback(() => {
    setShowWatcherPanel(false);
  }, []);

  // Watcher: remove a specific repo
  const handleRemoveRepoFromWatcher = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const status = await removeWatchedRepo(path);
      setWatchedRepoCount(status.watched_repos.length);
      // Refresh the details list
      const details = await getWatchedRepoDetails();
      setWatchedRepoDetails(details.repos);
    } catch (err) {
      setError(`⚠️ ${err}`);
    }
    setLoading(false);
  }, []);

  // Watcher: open a conflicted file directly from the panel
  const handleOpenConflictedFile = useCallback(async (filePath: string) => {
    setLoading(true);
    setError(null);
    try {
      // Check if already open
      const existing = tabs.findIndex((t) => t.filePath === filePath);
      if (existing >= 0) {
        setActiveTabIndex(existing);
        setActiveConflictIndex(0);
        setShowWatcherPanel(false);
        setLoading(false);
        return;
      }

      const result = await openFileViaTauri(filePath);
      setTabs((prev) => [...prev, { filePath, session: result }]);
      setActiveTabIndex(tabs.length);
      setActiveConflictIndex(0);
      setShowWatcherPanel(false);
    } catch (err) {
      setError(`⚠️ ${err}`);
    }
    setLoading(false);
  }, [tabs]);

  // Watcher: stop the daemon
  const handleStopWatcher = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await stopWatcher();
      setWatcherRunning(false);
      setWatchedRepoCount(status.watched_repos.length);
      setError("⏸ Conflict watcher stopped");
      setTimeout(() => setError(null), 5000);
    } catch (err) {
      setError(`⚠️ ${err}`);
    }
    setLoading(false);
  }, []);

  // Check initial hook + watcher status on mount
  useEffect(() => {
    getConflictHookStatus()
      .then((status) => setAutoStartEnabled(status.installed))
      .catch(() => {});

    getWatcherStatus()
      .then((s) => {
        setWatcherRunning(s.running);
        setWatchedRepoCount(s.watched_repos.length);
      })
      .catch(() => {});

    // Auto-open session from mergetool mode (git mergetool triggered launch)
    getInitialSession()
      .then((session) => {
        if (session && !initialSessionLoadedRef.current) {
          initialSessionLoadedRef.current = true;
          setIsMergetoolMode(true);
          const path = session.file_path;
          setTabs((prev) => [...prev, { filePath: path, session }]);
          setActiveTabIndex(0);
          setActiveConflictIndex(0);
        }
      })
      .catch(() => {});
  }, []);

  // Listen for conflict-detected events from the backend watcher
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ConflictDetectedPayload>("conflict-detected", (event) => {
      const repoName = event.payload.repo_root.split("/").pop() || "repo";
      setError(`🚨 ${event.payload.conflict_count} conflict(s) in ${repoName}!`);
      // Auto-dismiss after 8 seconds
      setTimeout(() => setError(null), 8000);
      // Play a subtle notification chime
      playConflictChime();
      // Trigger auto-refresh of the watched repos panel
      setPanelRefreshKey((prev) => prev + 1);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Listen for conflicts-resolved events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ repo_root: string }>("conflicts-resolved", (event) => {
      const repoName = event.payload.repo_root.split("/").pop() || "repo";
      setError(`✅ Conflicts resolved in ${repoName}`);
      setTimeout(() => setError(null), 5000);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  // Close active tab shortcut (Cmd+W)
  const handleCloseActiveTab = useCallback(() => {
    if (tabs.length > 0) {
      handleCloseTab(activeTabIndex);
    }
  }, [tabs.length, activeTabIndex, handleCloseTab]);

  // Open manual resolution dialog for a specific conflict
  const handleOpenManualEdit = useCallback((conflict: ConflictBlock) => {
    setManualEditConflict(conflict);
  }, []);

  // Handle manual resolution confirmation
  const handleManualConfirm = useCallback(
    async (content: string) => {
      if (!manualEditConflict) return;
      const id = manualEditConflict.id;
      try {
        await handleResolve(id, { Manual: content });
        handleNextConflict();
        // Only close dialog after successful resolve
        setManualEditConflict(null);
      } catch {
        // Error already handled by handleResolve — keep dialog open so user can retry
      }
    },
    [manualEditConflict, handleResolve, handleNextConflict]
  );

  const handleCloseManualEdit = useCallback(() => {
    setManualEditConflict(null);
  }, []);

  // Counter to force scroll effect even when currentConflictId doesn't change
  const [scrollCounter, setScrollCounter] = useState(0);

  // Auto-scroll to the active conflict block in the result pane.
  // Uses programmaticScrollRef to prevent cascading feedback loops
  // with the pane scroll-sync mechanism.
  useEffect(() => {
    if (currentConflictIndex < 0 || currentConflictId <= 0) return;
    const pane = refs.center.current;
    if (!pane) return;
    const frameId = requestAnimationFrame(() => {
      const el = pane.querySelector(`[data-conflict-id="${currentConflictId}"]`);
      if (el) {
        // Mark as programmatic before changing scroll, so handleScroll
        // doesn't cascade back.
        programmaticScrollRef.current = true;
        // Use "auto" instead of "smooth" to avoid trailing scroll events
        // during the animation that would trigger cascading syncs.
        el.scrollIntoView({ behavior: "auto", block: "center" });
        // Clear guard after one frame to allow user-initiated scroll events
        requestAnimationFrame(() => {
          programmaticScrollRef.current = false;
        });
      }
    });
    return () => cancelAnimationFrame(frameId);
  }, [currentConflictIndex, currentConflictId, scrollCounter, refs.center, programmaticScrollRef]);

  // Auto-clear file highlight flashes after the animation finishes (1.5s)
  // Lives in App.tsx so the state persists across panel open/close
  useEffect(() => {
    const repos = Object.keys(highlightedFiles);
    if (repos.length === 0) return;
    const timer = setTimeout(() => setHighlightedFiles({}), 1500);
    return () => clearTimeout(timer);
  }, [highlightedFiles]);

  // Toggle shortcuts help overlay (Cmd+/ or ? without modifiers)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      // Cmd+/ or Ctrl+/
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // ? (unmodified) — toggle
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // Escape — close if open
      if (e.key === "Escape" && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showShortcuts]);

  // Register keyboard shortcuts
  useKeyboard({
    onNextConflict: handleNextConflict,
    onPrevConflict: handlePrevConflict,
    onAcceptLocal: handleAcceptLocal,
    onAcceptRemote: handleAcceptRemote,
    onAcceptBoth: handleAcceptBoth,
    onMagicMerge: handleMagicMerge,
    onSave: handleSave,
    onOpenFile: handleOpenFile,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToggleBasePanel: handleToggleBase,
    onOpenOverview: handleOpenOverview,
    onCloseTab: handleCloseActiveTab,
    onToggleDebug: handleToggleDebug,
    onManualEdit: () => {
      if (currentConflictId > 0 && session) {
        const conflict = session.conflicts.find(c => c.id === currentConflictId);
        if (conflict && conflict.status === 'Unresolved') {
          handleOpenManualEdit(conflict);
        }
      }
    },
  });

  // Render side pane (LOCAL or REMOTE) with conflict action buttons (>> accept, X ignore)
  // Inspired by IntelliJ IDEA's merge layout
  const renderSidePaneWithActions = (side: 'local' | 'remote') => {
    if (!session) return null;

    const content = side === 'local' ? session.all_local_content : session.all_remote_content;
    const highlighted = side === 'local' ? highlightedLocal : highlightedRemote;
    const contentLines = content.split('\n');
    const originalLines = session.original_content.split('\n');
    const sortedConflicts = [...session.conflicts].sort((a, b) => a.start_line - b.start_line);

    // Build a Set of original line numbers that belong to any conflict
    const conflictRanges = new Set<number>();
    for (const c of sortedConflicts) {
      for (let ln = c.start_line; ln <= c.end_line; ln++) {
        conflictRanges.add(ln);
      }
    }

    const result: React.ReactNode[] = [];
    let conflictIdx = 0;
    let contentIdx = 0;

    for (let i = 0; i < originalLines.length; i++) {
      const lineNum = i + 1;
      const nextConflict = sortedConflicts[conflictIdx];
      const sideLineCount = side === 'local'
        ? nextConflict?.local_lines.length ?? 0
        : nextConflict?.remote_lines.length ?? 0;

      if (nextConflict && lineNum === nextConflict.start_line) {
        const sideLines = side === 'local' ? nextConflict.local_lines : nextConflict.remote_lines;
        const status = nextConflict.status;
        const sideKey = `${side}-${nextConflict.id}`;

        // Track which sides have already been used (one click per side per conflict)
        const sideUsed = usedSides.current.has(sideKey);
        const otherKey = side === 'local' ? `remote-${nextConflict.id}` : `local-${nextConflict.id}`;
        const otherUsed = usedSides.current.has(otherKey);

        // Show buttons if this side hasn't been used yet AND
        // (conflict is still unresolved OR the other side already chose)
        const canActNow = !sideUsed && (status === 'Unresolved' || otherUsed);

        const handleAccept = async () => {
          try {
            if (side === 'local') {
              if (status === 'Unresolved') await handleResolve(nextConflict.id, 'Local');
              else if (status === 'ResolvedWithRemote') await handleResolve(nextConflict.id, 'Both');
            } else {
              if (status === 'Unresolved') await handleResolve(nextConflict.id, 'Remote');
              else if (status === 'ResolvedWithLocal') await handleResolve(nextConflict.id, 'Both');
            }
            usedSides.current.add(sideKey);
          } catch {
            // Don't mark as used on error
          }
        };

        const handleIgnore = async () => {
          try {
            if (side === 'local') {
              if (status === 'Unresolved') await handleResolve(nextConflict.id, 'Remote');
              else if (status === 'ResolvedWithLocal') await handleResolve(nextConflict.id, 'Remote');
              else if (status === 'ResolvedWithBoth') await handleResolve(nextConflict.id, 'Remote');
            } else {
              if (status === 'Unresolved') await handleResolve(nextConflict.id, 'Local');
              else if (status === 'ResolvedWithRemote') await handleResolve(nextConflict.id, 'Local');
              else if (status === 'ResolvedWithBoth') await handleResolve(nextConflict.id, 'Local');
            }
            usedSides.current.add(sideKey);
          } catch {
            // Don't mark as used on error
          }
        };

        result.push(
          <div
            key={`conflict-${side}-${nextConflict.id}`}
            className={`conflict-side-block ${sideUsed ? 'conflict-side-block--used' : ''}`}
            data-conflict-id={nextConflict.id}
          >
            <div className="conflict-side-lines">
              {sideLines.length > 0 ? (
                sideLines.map((line, li) => (
                  <div key={li} className="conflict-side-line">
                    <span className="line-number conflict-side-line-num">{contentIdx + li + 1}</span>
                    <span className="conflict-side-line-text">{line}</span>
                  </div>
                ))
              ) : (
                <div className="conflict-side-line conflict-side-line--empty">
                  <span className="line-number conflict-side-line-num">{contentIdx + 1}</span>
                  <span className="conflict-side-line-text">(empty)</span>
                </div>
              )}
            </div>
            {canActNow && (
              <div className="conflict-side-buttons conflict-side-buttons--grouped">
                <button
                  type="button"
                  className="conflict-side-btn conflict-side-btn--accept"
                  onClick={handleAccept}
                  title={`Accept ${side === 'local' ? 'your' : 'their'} version`}
                >
                  {side === 'local' ? '>>' : '<<'}
                </button>
                <button
                  type="button"
                  className="conflict-side-btn conflict-side-btn--ignore"
                  onClick={handleIgnore}
                  title={`Ignore ${side === 'local' ? 'your' : 'their'} version, use the other side`}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );

        conflictIdx += 1;
        contentIdx += sideLineCount;
        i = nextConflict.end_line;
        continue;
      }

      // Skip lines inside conflict markers in original content
      if (conflictRanges.has(lineNum)) {
        continue;
      }

      // Normal line (outside all conflicts)
      if (contentIdx < contentLines.length) {
        const safeIdx = Math.min(contentIdx, highlighted.length - 1);
        const highlightedHtml = safeIdx >= 0 ? (highlighted[safeIdx] ?? '') : '';
        result.push(
          <div key={`line-${side}-${contentIdx}`} className="pane-line pane-line--normal">
            <span className="line-number">{contentIdx + 1}</span>
            <span
              className="line-text"
              dangerouslySetInnerHTML={{
                __html: highlightedHtml || ' ',
              }}
            />
          </div>
        );
        contentIdx++;
      }
    }

    return <div className="pane-lines">{result}</div>;
  };

  // Render result content — shows the merged RESULT
  // Unresolved conflicts show original content with markers;
  // resolved conflicts show the resolved version
  const renderResultContent = () => {
    if (!session) return null;

    const originalLines = session.original_content.split("\n");
    const sortedConflicts = [...session.conflicts].sort((a, b) => a.start_line - b.start_line);

    // Build a Set of original line numbers that belong to any conflict
    const conflictRanges = new Set<number>();
    for (const c of sortedConflicts) {
      for (let ln = c.start_line; ln <= c.end_line; ln++) {
        conflictRanges.add(ln);
      }
    }

    const result: React.ReactNode[] = [];
    let lineIdx = 0;
    let conflictIdx = 0;
    let i = 0;

    while (i < originalLines.length) {
      const lineNum = i + 1;
      const nextConflict = sortedConflicts[conflictIdx];

      if (nextConflict && lineNum === nextConflict.start_line) {
        const isResolved = nextConflict.status !== "Unresolved";

        if (isResolved) {
          // Resolved — show the chosen version
          let resolvedLines: string[];
          switch (nextConflict.status) {
            case "ResolvedWithLocal":
              resolvedLines = nextConflict.local_lines;
              break;
            case "ResolvedWithRemote":
              resolvedLines = nextConflict.remote_lines;
              break;
            case "ResolvedWithBoth":
              resolvedLines = [...nextConflict.local_lines, ...nextConflict.remote_lines];
              break;
            default:
              resolvedLines = nextConflict.local_lines;
          }

          result.push(
            <div key={`conflict-${nextConflict.id}`} className="result-resolved-region">
              {resolvedLines.map((line, li) => (
                <div key={li} className="pane-line pane-line--resolved">
                  <span className="line-number">{lineIdx + li + 1}</span>
                  <span className="line-text">{line}</span>
                </div>
              ))}
            </div>
          );
          lineIdx += resolvedLines.length;
        } else {
          // Unresolved — show original conflict markers as code
          result.push(
            <div key={`conflict-${nextConflict.id}`} className="result-unresolved-region">
              <div className="result-unresolved-label">&lt;&lt;&lt;&lt;&lt;&lt;&lt; Yours</div>
              {nextConflict.local_lines.map((line, li) => (
                <div key={`local-${li}`} className="pane-line pane-line--conflict">
                  <span className="line-number">{lineIdx + li + 1}</span>
                  <span className="line-text">{line}</span>
                </div>
              ))}
              <div className="result-unresolved-sep">=======</div>
              {nextConflict.remote_lines.map((line, li) => (
                <div key={`remote-${li}`} className="pane-line pane-line--conflict">
                  <span className="line-number">{lineIdx + nextConflict.local_lines.length + li + 1}</span>
                  <span className="line-text">{line}</span>
                </div>
              ))}
              <div className="result-unresolved-label">&gt;&gt;&gt;&gt;&gt;&gt;&gt; Theirs</div>
              <div className="result-unresolved-actions">
                <button
                  type="button"
                  className="result-manual-btn"
                  onClick={() => handleOpenManualEdit(nextConflict)}
                  title="Manually edit the resolved content"
                >
                  ✏ Manual Edit
                </button>
              </div>
            </div>
          );
          lineIdx += nextConflict.local_lines.length + nextConflict.remote_lines.length;
        }

        conflictIdx += 1;
        i = nextConflict.end_line;
        continue;
      }

      // Skip lines inside conflict markers (in original content)
      if (conflictRanges.has(lineNum)) {
        i++;
        continue;
      }

      // Normal line — render with syntax highlighting
      const highlightedHtml = highlightedLocal[lineIdx] ?? "";
      result.push(
        <div key={`line-${i}`} className="pane-line pane-line--normal">
          <span className="line-number">{lineIdx + 1}</span>
          <span
            className="line-text"
            dangerouslySetInnerHTML={{
              __html: highlightedHtml || " ",
            }}
          />
        </div>
      );
      lineIdx++;
      i++;
    }

    return <div className="pane-lines">{result}</div>;
  };

  return (
    <div className="splice-layout">
      {/* Title Bar */}
      <div className="title-bar">
        <span className="title-bar-icon">⛓️</span>
        <span className="title-bar-text">Splice</span>
        {session && (
          <>
            <span className="title-bar-sep">—</span>
            <span className="title-bar-file">
              {session.file_path.split("/").pop()}
            </span>
          </>
        )}
        <div className="title-bar-spacer" />
        <span className="title-bar-status">
          {loading
            ? "● loading"
            : session
              ? `● ${tabs.length} file${tabs.length > 1 ? "s" : ""}`
              : "● idle"}
          {showBase && <span className="title-bar-base-badge">BASE</span>}
        </span>
      </div>

      {/* Content area: TabBar + debug banner + panes stack vertically */}
      <div className="pane-content-area">
        {/* Tab Bar */}
        {tabs.length > 0 && (
          <TabBar
            tabs={tabs.map((t) => ({ filePath: t.filePath }))}
            activeIndex={activeTabIndex}
            onSelect={handleSelectTab}
            onClose={handleCloseTab}
            onNewTab={handleOpenFile}
          />
        )}

        {/* Debug banner — shows session debug info (Cmd+Shift+D to toggle) */}
        {showDebug && session && debugInfo && (
          <div style={{
            background: "#1a1a2e",
            borderBottom: "2px solid #ff6b6b",
            color: "#e6edf3",
            padding: "8px 16px",
            fontFamily: "monospace",
            fontSize: "12px",
            lineHeight: "1.6",
            display: "flex",
            flexDirection: "column" as const,
            gap: "4px",
          }}>
            <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
              <strong style={{color: "#ff6b6b"}}>🔍 Session Debug</strong>
              <span style={{color: "#8b949e", fontSize: "11px"}}>
                {session?.file_path?.split("/")?.pop()}
              </span>
              <span style={{marginLeft: "auto", fontSize: "10px", color: "#484F58"}}>
                Cmd+Shift+D to hide
              </span>
              <button
                onClick={() => setShowDebug(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8b949e",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "0 4px",
                  lineHeight: "1",
                }}
                title="Close debug panel"
              >
                ×
              </button>
            </div>
            <pre style={{margin: 0, whiteSpace: "pre-wrap", fontSize: "11px", color: "#e6edf3"}}>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}

        {/* Three-Pane Area */}
        <div className={`panes ${showBase ? "panes--with-base" : ""}`}>
        {/* LOCAL */}
        <div
          className="pane pane-side"
          data-side="local"
          ref={refs.left}
          onScroll={() => handleScroll("left")}
        >
          <div className="pane-header">Yours (Current)</div>
          {session ? (
            renderSidePaneWithActions('local')
          ) : (
            <div className="pane-content pane-placeholder">
              <div className="placeholder-icon">📂</div>
              <div className="placeholder-text">
                Drop a conflicted file here
                <br />
                or run <code>git mergetool</code>
              </div>
            </div>
          )}
        </div>

        {/* RESULT */}
        <div
          className="pane pane-result"
          ref={refs.center}
          onScroll={() => handleScroll("center")}
        >
          <div className="pane-header">Result</div>
          {session ? (
            renderResultContent()
          ) : (
            <div className="pane-content pane-placeholder">
              <div className="placeholder-icon">⛓️</div>
              <div className="placeholder-text">Splice</div>
              <div className="placeholder-sub">Git Conflict Resolver</div>
              <div className="placeholder-hint">
                <code>Cmd + O</code> to open a file
              </div>
              <button
                className="btn btn-config"
                onClick={handleConfigureMergetool}
                title="Configure Splice as your global git mergetool"
              >
                ⚙ Configure Global Mergetool
              </button>
            </div>
          )}
        </div>

        {/* REMOTE */}
        <div
          className="pane pane-side"
          data-side="remote"
          ref={refs.right}
          onScroll={() => handleScroll("right")}
        >
          <div className="pane-header">Theirs (Merged)</div>
          {session ? (
            renderSidePaneWithActions('remote')
          ) : (
            <div className="pane-content pane-placeholder">
              <div className="placeholder-icon">📂</div>
              <div className="placeholder-text">
                Waiting for conflicts
                <br />
                to resolve...
              </div>
            </div>
          )}
        </div>

        {/* BASE (optional, toggled by Cmd+\) */}
        {showBase && (
          <BasePane
            content={session?.all_base_content ?? ""}
            conflicts={session?.conflicts ?? []}
            activeConflictId={currentConflictId}
            scrollRef={refs.base}
            onScroll={() => handleScroll("base")}
            highlightedLines={highlightedBase}
          />
        )}
      </div>
      </div>

      {/* Magic Merge Dialog */}
      {magicResult && (
        <MagicMergeDialog
          autoResolved={magicResult.autoResolved}
          remaining={magicResult.remaining}
          filePath={magicResult.filePath}
          onUndo={handleUndoMagic}
          onClose={handleCloseMagic}
        />
      )}

      {/* Watched Repos Panel */}
      <WatchedRepoPanel
        isOpen={showWatcherPanel}
        repos={watchedRepoDetails}
        watcherRunning={watcherRunning}
        onClose={handleCloseWatcherPanel}
        onRemoveRepo={handleRemoveRepoFromWatcher}
        onAddRepo={handleAddWatchedRepo}
        onStopWatcher={handleStopWatcher}
        onOpenConflictedFile={handleOpenConflictedFile}
        refreshKey={panelRefreshKey}
        highlightedFiles={highlightedFiles}
        onSetHighlightedFiles={setHighlightedFiles}
      />

      {/* Manual Resolution Dialog */}
      {manualEditConflict && (
        <ManualResolveDialog
          block={manualEditConflict}
          onConfirm={handleManualConfirm}
          onCancel={handleCloseManualEdit}
        />
      )}

      {/* Shortcuts Help Overlay */}
      <ShortcutsOverlay
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Conflict Overview Sidebar */}
      <ConflictOverview
        conflicts={session?.conflicts ?? []}
        activeConflictId={currentConflictId}
        isOpen={showOverview}
        onClose={() => setShowOverview(false)}
        onJumpTo={handleJumpToConflict}
      />

      {/* Error toast */}
      {error && (
        <div className="toast">
          <span>{error}</span>
          <button className="toast-close" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      {/* Bottom Status Bar */}
      <StatusBar
        session={session}
        diffs={diffs}
        currentIndex={currentConflictIndex}
        canUndo={(session?.undo_stack?.length ?? 0) > 0}
        canRedo={(session?.redo_stack?.length ?? 0) > 0}
        hasSession={session !== null}
        loading={loading}
        autoStartEnabled={autoStartEnabled}
        isMergetoolMode={isMergetoolMode}
        watcherRunning={watcherRunning}
        watchedRepoCount={watchedRepoCount}
        onPrevConflict={handlePrevConflict}
        onNextConflict={handleNextConflict}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onMagicMerge={handleMagicMerge}
        onSave={handleSave}
        onOpenFile={handleOpenFile}
        onConfigureMergetool={handleConfigureMergetool}
        onToggleAutoStart={handleToggleAutoStart}
        onAddWatchedRepo={handleAddWatchedRepo}
        onStopWatcher={handleStopWatcher}
        onOpenWatcherPanel={handleOpenWatcherPanel}
      />
    </div>
  );
}

export default App;
