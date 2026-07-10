import type { ConflictBlock as ConflictBlockType, ResolveAction } from "../lib/tauri";

interface Props {
  block: ConflictBlockType;
  isActive: boolean;
  index: number;
  total: number;
  onResolve: (conflictId: number, action: ResolveAction) => void;
}

export function ConflictBlock({ block, isActive, index, total, onResolve }: Props) {
  const isEmpty = block.local_lines.length === 0 && block.remote_lines.length === 0;

  if (isEmpty) return null;

  const isResolved = block.status !== "Unresolved";

  return (
    <div
      className={`conflict-block ${isActive ? "conflict-block--active" : ""} ${
        isResolved ? "conflict-block--resolved" : "conflict-block--unresolved"
      }`}
      data-conflict-id={block.id}
    >
      {/* Header */}
      <div className="conflict-block-header">
        <span className="conflict-block-title">
          ⚡ Conflict {index}/{total}
        </span>
        <span className="conflict-block-lines">
          Lines {block.start_line}–{block.end_line}
        </span>
        {isResolved && <span className="conflict-block-done">✓ Resolved</span>}
      </div>

      {/* Content preview */}
      <div className="conflict-block-content">
        {!isResolved ? (
          <>
            <div className="conflict-line conflict-line--local">
              <span className="conflict-line-label">Yours:</span>
              <span className="conflict-line-text">
                {block.local_lines.length > 0
                  ? block.local_lines.slice(0, 3).join(" ")
                  : "(empty)"}
                {block.local_lines.length > 3 && " ..."}
              </span>
            </div>
            <div className="conflict-line conflict-line--remote">
              <span className="conflict-line-label">Theirs:</span>
              <span className="conflict-line-text">
                {block.remote_lines.length > 0
                  ? block.remote_lines.slice(0, 3).join(" ")
                  : "(empty)"}
                {block.remote_lines.length > 3 && " ..."}
              </span>
            </div>
          </>
        ) : (
          <div className="conflict-line conflict-line--resolved">
            <span className="conflict-line-label">Resolved:</span>
            <span className="conflict-line-text">
              {block.status === "ResolvedWithLocal" && "Using your version"}
              {block.status === "ResolvedWithRemote" && "Using their version"}
              {block.status === "ResolvedWithBoth" && "Both versions kept"}
              {typeof block.status === "object" &&
               "status" in block.status &&
               (block.status as any).ResolvedManual !== undefined &&
               "Manual edit"}
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isResolved && (
        <div className="conflict-block-actions">
          <button
            className="conflict-btn conflict-btn--local"
            onClick={() => onResolve(block.id, "Local")}
            title="Use your version (Cmd+')"
          >
            ← Use Yours
          </button>
          <button
            className="conflict-btn conflict-btn--both"
            onClick={() => onResolve(block.id, "Both")}
            title="Keep both versions"
          >
            ↔ Keep Both
          </button>
          <button
            className="conflict-btn conflict-btn--remote"
            onClick={() => onResolve(block.id, "Remote")}
            title="Use their version (Cmd+.)"
          >
            Use Theirs →
          </button>
        </div>
      )}
    </div>
  );
}
