import type { ConflictBlock as ConflictBlockType } from "../lib/tauri";

interface Props {
  conflicts: ConflictBlockType[];
  activeConflictId: number;
  isOpen: boolean;
  onClose: () => void;
  onJumpTo: (conflictId: number) => void;
}

export function ConflictOverview({
  conflicts,
  activeConflictId,
  isOpen,
  onClose,
  onJumpTo,
}: Props) {
  if (!isOpen) return null;

  const resolved = conflicts.filter((c) => c.status !== "Unresolved");
  const unresolved = conflicts.filter((c) => c.status === "Unresolved");

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overview-header">
          <span className="overview-title">☰ Conflict Overview</span>
          <button className="overview-close" onClick={onClose}>×</button>
        </div>

        {conflicts.length === 0 ? (
          <div className="overview-empty">No conflicts found</div>
        ) : (
          <div className="overview-list">
            {/* Unresolved */}
            {unresolved.length > 0 && (
              <>
                <div className="overview-group-header">
                  ⚠️ Unresolved ({unresolved.length})
                </div>
                {unresolved.map((c) => (
                  <div
                    key={c.id}
                    className={`overview-item ${
                      c.id === activeConflictId ? "overview-item--active" : ""
                    }`}
                    onClick={() => onJumpTo(c.id)}
                  >
                    <span className="overview-item-icon">⚡</span>
                    <span className="overview-item-label">
                      Conflict {c.id}
                    </span>
                    <span className="overview-item-lines">
                      L{c.start_line}–{c.end_line}
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Resolved */}
            {resolved.length > 0 && (
              <>
                <div className="overview-group-header overview-group-header--done">
                  ✅ Resolved ({resolved.length})
                </div>
                {resolved.map((c) => (
                  <div
                    key={c.id}
                    className={`overview-item overview-item--done ${
                      c.id === activeConflictId ? "overview-item--active" : ""
                    }`}
                    onClick={() => onJumpTo(c.id)}
                  >
                    <span className="overview-item-icon">✓</span>
                    <span className="overview-item-label">
                      Conflict {c.id}
                    </span>
                    <span className="overview-item-lines">
                      L{c.start_line}–{c.end_line}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
