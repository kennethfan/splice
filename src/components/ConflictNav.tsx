interface Props {
  currentIndex: number;
  totalCount: number;
  resolvedCount: number;
  saved: boolean;
  hasSession: boolean;
  onPrevConflict: () => void;
  onNextConflict: () => void;
  onMagicMerge: () => void;
  onSave: () => void;
  onOpenFile: () => void;
}

export function ConflictNav({
  currentIndex,
  totalCount,
  resolvedCount,
  saved,
  hasSession,
  onPrevConflict,
  onNextConflict,
  onMagicMerge,
  onSave,
  onOpenFile,
}: Props) {
  const allResolved = hasSession && totalCount > 0 && resolvedCount === totalCount;
  const progress = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  return (
    <div className="bottom-bar">
      {/* Left: file info */}
      <div className="bottom-left">
        <span className="conflict-count">
          {hasSession
            ? `Conflicts: ${resolvedCount}/${totalCount}`
            : "Conflicts: —"}
        </span>
        {hasSession && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Center: navigation + actions */}
      <div className="bottom-center">
        {!hasSession ? (
          <>
            <button className="btn btn-action" onClick={onOpenFile}>
              📂 Open File
            </button>
            <span className="nav-text">or run <code>git mergetool</code></span>
          </>
        ) : (
          <>
            <button
              className="btn btn-nav"
              onClick={onPrevConflict}
              disabled={currentIndex <= 0}
              title="Previous conflict (Shift+Tab)"
            >
              ▲
            </button>

            <span className="nav-text">
              {currentIndex + 1 > totalCount ? totalCount : currentIndex + 1}/{totalCount}
            </span>

            <button
              className="btn btn-nav"
              onClick={onNextConflict}
              disabled={currentIndex >= totalCount - 1}
              title="Next conflict (Tab)"
            >
              ▼
            </button>

            <span className="nav-divider">|</span>

            <button
              className="btn btn-action btn-magic"
              onClick={onMagicMerge}
              disabled={allResolved}
              title="Auto-resolve non-conflicting changes (Cmd+M)"
            >
              ✨ Magic Merge
            </button>

            <button
              className="btn btn-action btn-save"
              onClick={onSave}
              disabled={saved}
              title="Save resolved file (Cmd+S)"
            >
              {saved ? "✓ Saved" : "💾 Save"}
            </button>
          </>
        )}
      </div>

      {/* Right: status */}
      <div className="bottom-right">
        {hasSession && (
          <span className={`status-dot ${allResolved ? "status-dot--done" : "status-dot--active"}`}>
            {allResolved ? "● ready" : "● resolving"}
          </span>
        )}
        <span className="version">v0.1.0</span>
      </div>
    </div>
  );
}
