import { useState } from "react";
import type {
  ConflictBlock as ConflictBlockType,
  ResolveAction,
  BlockDiff,
} from "../lib/tauri";
import { DiffText } from "./DiffText";
import { getWordChangesForLine } from "./HoverPreview";
import { ManualResolveDialog } from "./ManualResolveDialog";

interface Props {
  block: ConflictBlockType;
  isActive: boolean;
  index: number;
  total: number;
  onResolve: (conflictId: number, action: ResolveAction) => void;
  /** Word-level diff data for this block, or null if not computed */
  blockDiff?: BlockDiff | null;
}

export function ConflictBlock({ block, isActive, index, total, onResolve, blockDiff }: Props) {
  const [showManual, setShowManual] = useState(false);

  const handleManualConfirm = (content: string) => {
    setShowManual(false);
    onResolve(block.id, { Manual: content });
  };

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

      {/* Content preview — always shows Yours / Theirs / Resolved state.
          NO inline hover preview (was removed because layout shifts caused
          an endless feedback loop with the action buttons). */}
      <div className="conflict-block-content">
        {!isResolved ? (
          <>
            <div className="conflict-line conflict-line--local">
              <span className="conflict-line-label">Yours:</span>
              <span className="conflict-line-text">
                {block.local_lines.length > 0 ? (
                  block.local_lines.slice(0, 5).map((line, i) => {
                    const wc = blockDiff
                      ? getWordChangesForLine(
                          i,
                          blockDiff.local_vs_base,
                          blockDiff.local_word_changes,
                        )
                      : null;
                    return (
                      <span key={i} className="conflict-line-word">
                        <DiffText wordChanges={wc} text={line} />
                        {i < Math.min(block.local_lines.length, 5) - 1 && " "}
                      </span>
                    );
                  })
                ) : (
                  "(empty)"
                )}
                {block.local_lines.length > 5 && (
                  <span className="conflict-ellipsis"> ...</span>
                )}
              </span>
            </div>

            {/* "Accept Both" hint separator */}
            <div className="conflict-both-hint">
              <span className="conflict-both-hint-line" />
              <span className="conflict-both-hint-label" title="Keep both versions (Cmd+;)">
                ↔ Keep Both
              </span>
              <span className="conflict-both-hint-line" />
            </div>

            <div className="conflict-line conflict-line--remote">
              <span className="conflict-line-label">Theirs:</span>
              <span className="conflict-line-text">
                {block.remote_lines.length > 0 ? (
                  block.remote_lines.slice(0, 5).map((line, i) => {
                    const wc = blockDiff
                      ? getWordChangesForLine(
                          i,
                          blockDiff.remote_vs_base,
                          blockDiff.remote_word_changes,
                        )
                      : null;
                    return (
                      <span key={i} className="conflict-line-word">
                        <DiffText wordChanges={wc} text={line} />
                        {i < Math.min(block.remote_lines.length, 5) - 1 && " "}
                      </span>
                    );
                  })
                ) : (
                  "(empty)"
                )}
                {block.remote_lines.length > 5 && (
                  <span className="conflict-ellipsis"> ...</span>
                )}
              </span>
            </div>
          </>
        ) : (
          /* ── Resolved display ── */
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
        <div className="conflict-block-actions">            <button
              className="conflict-btn conflict-btn--local"
              onClick={() => onResolve(block.id, "Local")}
              title="Use your version (Cmd+')"
            >
              ← Use Yours
            </button>
            <button
              className="conflict-btn conflict-btn--both"
              onClick={() => onResolve(block.id, "Both")}
              title="Keep both versions (Cmd+;)"
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
            <button
              className="conflict-btn conflict-btn--manual"
              onClick={() => setShowManual(true)}
              title="Edit custom resolution manually"
            >
              ✏ Manual
            </button>
        </div>
      )}

      {/* Manual Resolution Dialog */}
      {showManual && (
        <ManualResolveDialog
          block={block}
          onConfirm={handleManualConfirm}
          onCancel={() => setShowManual(false)}
        />
      )}
    </div>
  );
}
