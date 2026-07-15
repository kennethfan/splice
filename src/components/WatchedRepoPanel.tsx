import { useState, useCallback, useEffect, useRef } from "react";
import type { WatchedRepoDetail } from "../lib/tauri";
import { getRepoConflictedFiles } from "../lib/tauri";
import { playConflictChime } from "../lib/sound";

interface WatchedRepoPanelProps {
  isOpen: boolean;
  repos: WatchedRepoDetail[];
  watcherRunning: boolean;
  refreshKey?: number;
  highlightedFiles: Record<string, Set<string>>;
  onSetHighlightedFiles: React.Dispatch<React.SetStateAction<Record<string, Set<string>>>>;
  onClose: () => void;
  onRemoveRepo: (path: string) => void;
  onAddRepo: () => void;
  onStopWatcher: () => void;
  onOpenConflictedFile: (filePath: string) => void;
}

/// Get just the filename from a path
function fileNameFromPath(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function WatchedRepoPanel({
  isOpen,
  repos,
  watcherRunning,
  refreshKey,
  highlightedFiles,
  onSetHighlightedFiles,
  onClose,
  onRemoveRepo,
  onAddRepo,
  onStopWatcher,
  onOpenConflictedFile,
}: WatchedRepoPanelProps) {
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set());
  const [repoFiles, setRepoFiles] = useState<Record<string, string[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [justRefreshed, setJustRefreshed] = useState(0); // 0 = hidden, otherwise a timestamp
  // Keep a ref to always have the latest repoFiles (used in refreshRepoFiles callback)
  const repoFilesRef = useRef(repoFiles);
  repoFilesRef.current = repoFiles;

  // Auto-clear the "Refreshed ✓" indicator after 2 seconds
  useEffect(() => {
    if (!justRefreshed) return;
    const timer = setTimeout(() => setJustRefreshed(0), 2000);
    return () => clearTimeout(timer);
  }, [justRefreshed]);

  const toggleRepoFiles = useCallback(async (repoPath: string) => {
    if (expandedRepos.has(repoPath)) {
      setExpandedRepos((prev) => {
        const next = new Set(prev);
        next.delete(repoPath);
        return next;
      });
      return;
    }

    // Mark as loading
    setLoadingFiles((prev) => new Set(prev).add(repoPath));

    // Fetch files if not already cached
    if (!repoFiles[repoPath]) {
      try {
        const files = await getRepoConflictedFiles(repoPath);
        setRepoFiles((prev) => ({ ...prev, [repoPath]: files }));
      } catch {
        setRepoFiles((prev) => ({ ...prev, [repoPath]: [] }));
      }
    }

    setLoadingFiles((prev) => {
      const next = new Set(prev);
      next.delete(repoPath);
      return next;
    });
    setExpandedRepos((prev) => new Set(prev).add(repoPath));
  }, [expandedRepos, repoFiles]);

  // Refresh conflicted files for a repo (clears cache and re-fetches)
  const refreshRepoFiles = useCallback(async (repoPath: string) => {
    // Capture old files before clearing (using ref for latest state)
    const oldFiles = repoFilesRef.current[repoPath] || [];
    const oldSet = new Set(oldFiles);

    setLoadingFiles((prev) => new Set(prev).add(repoPath));
    // Clear cache
    setRepoFiles((prev) => {
      const next = { ...prev };
      delete next[repoPath];
      return next;
    });
    try {
      const files = await getRepoConflictedFiles(repoPath);
      setRepoFiles((prev) => ({ ...prev, [repoPath]: files }));

      // Find newly appeared files and flash-highlight them
      const newFiles = files.filter((f) => !oldSet.has(f));
      if (newFiles.length > 0) {
        onSetHighlightedFiles((prev) => ({
          ...prev,
          [repoPath]: new Set(newFiles),
        }));
        // Play a subtle notification chime for new files
        playConflictChime();
      }
    } catch {
      setRepoFiles((prev) => ({ ...prev, [repoPath]: [] }));
    }
    setLoadingFiles((prev) => {
      const next = new Set(prev);
      next.delete(repoPath);
      return next;
    });
    // Show "Refreshed ✓" indicator — timestamp ensures every call resets the timer
    setJustRefreshed(Date.now());
  }, []);

  // Auto-refresh expanded repos when refreshKey changes (conflict-detected event)
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    const paths = Array.from(expandedRepos);
    if (paths.length === 0) return;
    // Await all refreshes (indicator is set inside refreshRepoFiles)
    Promise.all(paths.map((p) => refreshRepoFiles(p))).catch(() => {});
  }, [refreshKey]);

  if (!isOpen) return null;

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="watcher-panel" onClick={(e) => e.stopPropagation()}>
        <div className="watcher-panel-header">
          <span className="watcher-panel-icon">
            {watcherRunning ? "🔍" : "🔎"}
          </span>
          <span className="watcher-panel-title">Watched Repositories</span>
          {justRefreshed && (
            <span className="watcher-panel-refreshed-badge">✓ Refreshed</span>
          )}
          <button className="watcher-panel-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Status bar inside panel */}
        <div className="watcher-panel-status">
          <span className={`watcher-panel-dot ${watcherRunning ? "watcher-panel-dot--on" : "watcher-panel-dot--off"}`}>
            ●
          </span>
          <span>{watcherRunning ? "Watcher running" : "Watcher stopped"}</span>
          {watcherRunning && (
            <button
              className="watcher-panel-stop-btn"
              onClick={onStopWatcher}
              title="Stop watcher"
            >
              ⏹ Stop
            </button>
          )}
        </div>

        {/* Add repo button */}
        <div className="watcher-panel-actions">
          <button className="btn btn-action watcher-panel-add-btn" onClick={onAddRepo}>
            📂 Add Repository
          </button>
        </div>

        {/* Repo list */}
        <div className="watcher-panel-list">
          {repos.length === 0 ? (
            <div className="watcher-panel-empty">
              <div className="watcher-panel-empty-icon">📁</div>
              <div className="watcher-panel-empty-text">
                No repositories watched yet.
              </div>
              <div className="watcher-panel-empty-hint">
                Click "Add Repository" above to start watching a git repo for conflicts.
              </div>
            </div>
          ) : (
            repos.map((repo) => {
              const isExpanded = expandedRepos.has(repo.path);
              const isLoading = loadingFiles.has(repo.path);
              const files = repoFiles[repo.path];
              const hasFiles = files && files.length > 0;
              const showExpand = repo.has_conflicts || repo.has_merge_op;

              return (
                <div key={repo.path}>
                  <div className={`watcher-panel-item ${showExpand ? "watcher-panel-item--expandable" : ""}`}>
                    <div
                      className="watcher-panel-item-left"
                      onClick={showExpand ? () => toggleRepoFiles(repo.path) : undefined}
                      role={showExpand ? "button" : undefined}
                      tabIndex={showExpand ? 0 : undefined}
                      onKeyDown={showExpand ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleRepoFiles(repo.path);
                        }
                      } : undefined}
                    >
                      <span
                        className={`watcher-panel-item-status ${
                          repo.has_conflicts
                            ? "watcher-panel-item-status--conflict"
                            : repo.has_merge_op
                              ? "watcher-panel-item-status--merge"
                              : "watcher-panel-item-status--idle"
                        }`}
                        title={
                          repo.has_conflicts
                            ? "Active conflicts detected"
                            : repo.has_merge_op
                              ? "Merge operation in progress"
                              : "No conflicts"
                        }
                      >
                        {repo.has_conflicts ? "⚡" : repo.has_merge_op ? "🔄" : "✓"}
                      </span>
                      <div className="watcher-panel-item-info">
                        <span className="watcher-panel-item-name">
                          {repo.name}
                          {showExpand && (
                            <span className="watcher-panel-item-expand-icon">
                              {isLoading ? " ◌" : isExpanded ? " ▼" : " ▶"}
                            </span>
                          )}
                        </span>
                        <span className="watcher-panel-item-path">{repo.path}</span>
                      </div>
                    </div>
                    <button
                      className="watcher-panel-item-remove"
                      onClick={() => onRemoveRepo(repo.path)}
                      title="Remove from watch list"
                    >
                      ×
                    </button>
                  </div>

                  {/* Expanded conflict files */}
                  {isExpanded && (
                    <div className="watcher-panel-subitems">
                      <div className="watcher-panel-subitems-header">
                        <span className="watcher-panel-subitems-count">
                          {hasFiles ? `${files.length} file(s)` : ""}
                        </span>
                        <span className="watcher-panel-subitems-header-right">
                          {justRefreshed && (
                            <span className="watcher-panel-refreshed-badge watcher-panel-refreshed-badge--sub">✓ Refreshed</span>
                          )}
                          <button
                            className="watcher-panel-subitems-refresh"
                            onClick={() => refreshRepoFiles(repo.path)}
                            disabled={isLoading}
                            title="Refresh conflicted files"
                          >
                            {isLoading ? "◌" : "🔄"} Refresh
                          </button>
                        </span>
                      </div>
                      {isLoading ? (
                        <div className="watcher-panel-subitem-loading">
                          Loading conflicted files...
                        </div>
                      ) : hasFiles ? (
                        files.map((filePath) => {
                          const isHighlighted = highlightedFiles[repo.path]?.has(filePath);
                          return (
                          <div
                            key={filePath}
                            className={`watcher-panel-subitem ${isHighlighted ? "watcher-panel-subitem--flash" : ""}`}
                            onClick={() => onOpenConflictedFile(filePath)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenConflictedFile(filePath);
                              }
                            }}
                            title={`Open ${fileNameFromPath(filePath)} in Splice`}
                          >
                            <span className="watcher-panel-subitem-icon">📄</span>
                            <span className="watcher-panel-subitem-name">
                              {fileNameFromPath(filePath)}
                            </span>
                            <span className="watcher-panel-subitem-path">
                              {filePath}
                            </span>
                            <button
                              className="watcher-panel-subitem-open"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenConflictedFile(filePath);
                              }}
                              title={`Open ${fileNameFromPath(filePath)} in Splice`}
                            >
                              Open
                            </button>
                          </div>
                          );
                        })
                      ) : (
                        <div className="watcher-panel-subitem-empty">
                          No conflicted files found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
