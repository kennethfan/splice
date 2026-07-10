interface Props {
  autoResolved: number;
  remaining: number;
  filePath: string;
  onUndo: () => void;
  onClose: () => void;
}

export function MagicMergeDialog({
  autoResolved,
  remaining,
  filePath,
  onUndo,
  onClose,
}: Props) {
  const allDone = remaining === 0;

  return (
    <div className="magic-overlay" onClick={onClose}>
      <div className="magic-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="magic-header">
          <span className="magic-icon">{allDone ? "🎉" : "✨"}</span>
          <span className="magic-title">
            {allDone ? "All Conflicts Resolved!" : "Magic Merge Complete"}
          </span>
          <button className="magic-close" onClick={onClose}>×</button>
        </div>

        <div className="magic-body">
          <div className="magic-stats">
            <div className="magic-stat magic-stat--auto">
              <span className="magic-stat-value">{autoResolved}</span>
              <span className="magic-stat-label">Auto-Resolved</span>
            </div>
            <div className="magic-stat magic-stat--remaining">
              <span className="magic-stat-value">{remaining}</span>
              <span className="magic-stat-label">{allDone ? "Total" : "Remaining"}</span>
            </div>
          </div>

          <div className="magic-file">
            <span className="magic-file-label">File:</span>
            <span className="magic-file-path">{filePath}</span>
          </div>
        </div>

        <div className="magic-footer">
          <button className="btn btn-undo" onClick={onUndo}>
            ⏪ Undo All
          </button>
          <button className="btn btn-confirm" onClick={onClose}>
            {remaining > 0 ? "Continue Resolving" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
