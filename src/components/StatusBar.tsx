import { useState, useEffect, useCallback } from "react";
import type { MergeSession, BlockDiff, ConflictBlock } from "../lib/tauri";
import { isSoundMuted, setSoundMuted, resetSoundSettings } from "../lib/sound";

interface DiffStats {
  linesChanged: number;
  wordsAdded: number;
  wordsRemoved: number;
}

function computeDiffStats(diffs: BlockDiff[]): DiffStats {
  let linesChanged = 0;
  let wordsAdded = 0;
  let wordsRemoved = 0;

  for (const block of diffs) {
    // Count changed lines (Modified + Added from either side)
    // Use max of local/remote to avoid double-counting for the same conflict
    const maxLen = Math.max(block.local_vs_base.length, block.remote_vs_base.length);
    for (let i = 0; i < maxLen; i++) {
      const localChanged = i < block.local_vs_base.length &&
        (block.local_vs_base[i] === "Modified" || block.local_vs_base[i] === "Added");
      const remoteChanged = i < block.remote_vs_base.length &&
        (block.remote_vs_base[i] === "Modified" || block.remote_vs_base[i] === "Added");
      if (localChanged || remoteChanged) linesChanged++;
    }

    // Count word-level changes
    for (const wordChanges of block.local_word_changes) {
      for (const wc of wordChanges) {
        if (wc.status === "added" || wc.status === "modified") wordsAdded++;
        if (wc.status === "removed") wordsRemoved++;
      }
    }
    for (const wordChanges of block.remote_word_changes) {
      for (const wc of wordChanges) {
        if (wc.status === "added" || wc.status === "modified") wordsAdded++;
        if (wc.status === "removed") wordsRemoved++;
      }
    }
  }

  return { linesChanged, wordsAdded, wordsRemoved };
}

function countResolutions(conflicts: ConflictBlock[]): {
  local: number;
  remote: number;
  both: number;
  manual: number;
  unresolved: number;
} {
  const counts = { local: 0, remote: 0, both: 0, manual: 0, unresolved: 0 };
  for (const c of conflicts) {
    switch (c.status) {
      case "Unresolved":
        counts.unresolved++;
        break;
      case "ResolvedWithLocal":
        counts.local++;
        break;
      case "ResolvedWithRemote":
        counts.remote++;
        break;
      case "ResolvedWithBoth":
        counts.both++;
        break;
      default:
        if (typeof c.status === "object" && "ResolvedManual" in c.status) {
          counts.manual++;
        } else {
          counts.unresolved++;
        }
    }
  }
  return counts;
}

interface StatusBarProps {
  session: MergeSession | null;
  diffs: BlockDiff[] | null;
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSession: boolean;
  loading: boolean;
  autoStartEnabled?: boolean;
  isMergetoolMode?: boolean;
  watcherRunning?: boolean;
  watchedRepoCount?: number;
  onPrevConflict: () => void;
  onNextConflict: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMagicMerge: () => void;
  onSave: () => void;
  onOpenFile: () => void;
  onConfigureMergetool?: () => void;
  onToggleAutoStart?: () => void;
  onAddWatchedRepo?: () => void;
  onStopWatcher?: () => void;
  onOpenWatcherPanel?: () => void;
}

export function StatusBar({
  session,
  diffs,
  currentIndex,
  canUndo,
  canRedo,
  hasSession,
  loading,
  onPrevConflict,
  onNextConflict,
  onUndo,
  onRedo,
  onMagicMerge,
  onSave,
  onOpenFile,
  isMergetoolMode,
  onConfigureMergetool,
  autoStartEnabled,
  onToggleAutoStart,
  watcherRunning,
  watchedRepoCount,
  onAddWatchedRepo,
  onStopWatcher,
  onOpenWatcherPanel,
}: StatusBarProps) {
  const [soundMuted, setLocalSoundMuted] = useState(() => isSoundMuted());
  const [soundToast, setSoundToast] = useState<string | null>(null);
  const [resetToast, setResetToast] = useState<string | null>(null);

  const handleToggleSound = useCallback(() => {
    const next = !soundMuted;
    setSoundMuted(next);
    setLocalSoundMuted(next);
    setSoundToast(next ? "🔇 Muted" : "🔔 Unmuted");
  }, [soundMuted]);

  // Auto-clear toasts after 2 seconds
  useEffect(() => {
    if (!soundToast) return;
    const timer = setTimeout(() => setSoundToast(null), 2000);
    return () => clearTimeout(timer);
  }, [soundToast]);

  useEffect(() => {
    if (!resetToast) return;
    const timer = setTimeout(() => setResetToast(null), 2000);
    return () => clearTimeout(timer);
  }, [resetToast]);

  const handleResetSettings = useCallback(() => {
    const confirmed = window.confirm(
      "Reset all Splice settings to defaults?\n\n" +
      "This will clear your sound preferences and any other saved settings. " +
      "This action cannot be undone."
    );
    if (!confirmed) return;

    // Clear all splice:* keys from localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("splice:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Reset sound module state
    resetSoundSettings();
    setLocalSoundMuted(false);

    setResetToast("↺ Settings reset");
  }, []);

  // Global keyboard shortcuts (must be after both handlers are defined)
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

      const meta = e.metaKey || e.ctrlKey;
      if (!meta || !e.shiftKey) return;

      switch (e.key.toLowerCase()) {
        case "m":
          e.preventDefault();
          handleToggleSound();
          break;
        case "r":
          e.preventDefault();
          handleResetSettings();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleToggleSound, handleResetSettings]);

  const totalCount = session?.conflicts.length ?? 0;
  const resolvedCount = session?.resolved_count ?? 0;
  const unresolvedCount = session
    ? session.conflicts.filter((c) => c.status === "Unresolved").length
    : 0;
  const allResolved = hasSession && totalCount > 0 && resolvedCount === totalCount;
  const progress = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;
  const fileName = session?.file_path.split("/").pop() ?? "";

  const diffStats = diffs ? computeDiffStats(diffs) : null;
  const resolutionCounts = session ? countResolutions(session.conflicts) : null;

  // Disable prev when at first unresolved or none unresolved
  const prevDisabled = unresolvedCount === 0 || currentIndex <= 0;
  // Disable next when at last unresolved or none unresolved
  const nextDisabled = unresolvedCount === 0 || currentIndex >= unresolvedCount - 1;

  const hasDiffStats = diffStats && (diffStats.linesChanged > 0 || diffStats.wordsAdded > 0 || diffStats.wordsRemoved > 0);
  const hasResolutions = resolutionCounts && (resolutionCounts.local > 0 || resolutionCounts.remote > 0 || resolutionCounts.both > 0 || resolutionCounts.manual > 0);

  return (
    <div className={`status-bar ${allResolved ? "status-bar--done" : ""}`}>
      {/* Left: status dot + context */}
      <div className="status-bar-left">
        <span className={`status-bar-dot ${allResolved ? "status-bar-dot--done" : loading ? "status-bar-dot--loading" : "status-bar-dot--active"}`}>
          {loading ? "◌" : "●"}
        </span>
        {hasSession && (
          <>
            <span className="status-bar-file">{fileName}</span>
            <span className="status-bar-sep">·</span>
            <span className="status-bar-progress-text">
              {resolvedCount}/{totalCount}
            </span>
            <div className="status-bar-progress">
              <div
                className="status-bar-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Center-left: resolution breakdown */}
      {hasResolutions && (
        <div className="status-bar-resolution">
          {resolutionCounts!.local > 0 && (
            <span className="status-bar-badge status-bar-badge--local">
              ← {resolutionCounts!.local}
            </span>
          )}
          {resolutionCounts!.remote > 0 && (
            <span className="status-bar-badge status-bar-badge--remote">
              {resolutionCounts!.remote} →
            </span>
          )}
          {resolutionCounts!.both > 0 && (
            <span className="status-bar-badge status-bar-badge--both">
              ↔ {resolutionCounts!.both}
            </span>
          )}
          {resolutionCounts!.manual > 0 && (
            <span className="status-bar-badge status-bar-badge--manual">
              ✏ {resolutionCounts!.manual}
            </span>
          )}
          {resolutionCounts!.unresolved > 0 && (
            <span className="status-bar-badge status-bar-badge--unresolved">
              ⚡ {resolutionCounts!.unresolved}
            </span>
          )}
        </div>
      )}

      {/* Center: diff stats */}
      {hasDiffStats && (
        <div className="status-bar-diff">
          <span className="status-bar-diff-label">diff:</span>
          <span className="status-bar-diff-add">+{diffStats!.wordsAdded}</span>
          <span className="status-bar-diff-rem">-{diffStats!.wordsRemoved}</span>
          <span className="status-bar-diff-lines">~{diffStats!.linesChanged}L</span>
        </div>
      )}

      {/* Center-right: navigation + actions */}
      <div className="status-bar-actions">
        {!hasSession ? (
          <>
            <button className="btn btn-action" onClick={onOpenFile}>
              📂 Open File
            </button>
            {onConfigureMergetool && (
              <button
                className="btn btn-action btn-action--config"
                onClick={onConfigureMergetool}
                title="Configure Splice as your global git mergetool"
              >
                ⚙ Configure
              </button>
            )}
            {onToggleAutoStart && (
              <button
                className={`btn btn-action btn-action--auto ${autoStartEnabled ? "btn-action--auto-enabled" : ""}`}
                onClick={onToggleAutoStart}
                title={autoStartEnabled ? "Disable auto-launch on conflict" : "Auto-launch Splice when git merge conflicts are detected"}
              >
                {autoStartEnabled ? "🔔 Auto-Launch On" : "🔕 Auto-Launch Off"}
              </button>
            )}
            <span className="status-bar-hint">or <code>git mergetool</code></span>
          </>
        ) : (
          <>
            <button
              className="btn btn-icon"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Cmd+Z)"
            >
              ↶
            </button>
            <button
              className="btn btn-icon"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Cmd+Shift+Z)"
            >
              ↷
            </button>

            <span className="status-bar-sep">|</span>

            <button
              className="btn btn-icon"
              onClick={onPrevConflict}
              disabled={prevDisabled}
              title="Previous conflict (Shift+Tab)"
            >
              ▲
            </button>
            <span className="status-bar-nav-pos">
              {unresolvedCount > 0 ? currentIndex + 1 : 0}/{unresolvedCount}
            </span>
            <button
              className="btn btn-icon"
              onClick={onNextConflict}
              disabled={nextDisabled}
              title="Next conflict (Tab)"
            >
              ▼
            </button>

            <span className="status-bar-sep">|</span>

            <button
              className="btn btn-action btn-action--magic"
              onClick={onMagicMerge}
              disabled={allResolved}
              title="Auto-resolve non-conflicting changes (Cmd+M)"
            >
              ✨ Magic Merge
            </button>
            <button
              className="btn btn-action btn-action--save"
              onClick={onSave}
              disabled={session?.saved}
              title={isMergetoolMode ? "Save and exit (Cmd+S)" : "Save resolved file (Cmd+S)"}
            >
              {session?.saved ? "✓ Saved" : isMergetoolMode ? "💾 Save & Exit" : "💾 Save"}
            </button>
          </>
        )}
      </div>

      {/* Right: sound toggle + watcher status + metadata */}
      <div className="status-bar-right">
        <button
          className="btn btn-icon btn-icon--sound"
          onClick={handleToggleSound}
          title={soundMuted ? "Unmute notification sound (Cmd+Shift+M)" : "Mute notification sound (Cmd+Shift+M)"}
        >
          {soundMuted ? "🔇" : "🔔"}
          {soundToast && (
            <span className="sound-toast-badge">{soundToast}</span>
          )}
        </button>

        <span className="status-bar-sep">|</span>

        {onAddWatchedRepo && (
          <>
            <button
              className={`btn btn-icon btn-icon--watcher ${watcherRunning && (watchedRepoCount ?? 0) > 0 ? "btn-icon--watcher-active" : ""}`}
              onClick={onAddWatchedRepo}
              title={watcherRunning
                ? `Add another repo to watcher (currently watching ${watchedRepoCount ?? 0} repo(s))`
                : "Select a git repository to watch for conflicts"}
            >
              📂
            </button>
            {watcherRunning && onStopWatcher && (
              <button
                className="btn btn-icon btn-icon--watcher-stop"
                onClick={onStopWatcher}
                title={`Stop watcher (${watchedRepoCount ?? 0} repo(s) tracked)`}
              >
                ⏹
              </button>
            )}
            {watcherRunning && (watchedRepoCount ?? 0) > 0 && (
              <span
                className="watcher-count-badge"
                onClick={onOpenWatcherPanel}
                title={onOpenWatcherPanel ? "Manage watched repos" : undefined}
                role={onOpenWatcherPanel ? "button" : undefined}
                tabIndex={onOpenWatcherPanel ? 0 : undefined}
                onKeyDown={onOpenWatcherPanel ? (e) => { if (e.key === "Enter" || e.key === " ") onOpenWatcherPanel(); } : undefined}
              >
                {watchedRepoCount}
              </span>
            )}
          </>
        )}
        {!onAddWatchedRepo && watcherRunning && (
          <span className="btn-icon btn-icon--watcher btn-icon--watcher-active">
            🔍
          </span>
        )}
        <button
          className="btn btn-icon btn-icon--reset"
          onClick={handleResetSettings}
          title="Reset all settings to defaults (Cmd+Shift+R)"
        >
          ↺
          {resetToast && (
            <span className="sound-toast-badge">{resetToast}</span>
          )}
        </button>
        <span className="status-bar-version">v0.1.0</span>
      </div>
    </div>
  );
}

export { computeDiffStats };
