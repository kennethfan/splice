import type { ConflictBlock as ConflictBlockType } from "../lib/tauri";

interface Props {
  content: string;
  conflicts: ConflictBlockType[];
  activeConflictId: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  highlightedLines?: string[];
}

/**
 * BasePane — shows the BASE (common ancestor) version of the file.
 * Toggled via Cmd+\ to reveal a fourth column.
 *
 * Lines that differ from both LOCAL and REMOTE are highlighted,
 * and conflict regions are marked so the user can see what changed.
 */
export function BasePane({ content, conflicts, activeConflictId, scrollRef, onScroll, highlightedLines }: Props) {
  const lines = content ? content.split("\n") : [];
  const hasContent = content.length > 0;

  return (
    <div
      className="pane pane-side pane-base"
      ref={scrollRef}
      onScroll={onScroll}
    >
      <div className="pane-header">
        <span>Base (Ancestor)</span>
        {hasContent && <span className="pane-header-hint">Cmd+\ to hide</span>}
      </div>
      {hasContent ? (
        <div className="pane-lines">
          {lines.map((_line, i) => {
            const lineNum = i + 1;

            // Check if this line falls within any conflict block
            const conflict = conflicts.find(
              (c) => lineNum >= c.start_line && lineNum <= c.end_line,
            );
            const isActive = conflict && conflict.id === activeConflictId;

            let lineClass = "pane-line";
            if (conflict) {
              if (conflict.status !== "Unresolved") {
                lineClass += " pane-line--resolved";
              } else if (isActive) {
                lineClass += " pane-line--base-active";
              } else {
                lineClass += " pane-line--base";
              }
            }

            const highlightedHtml = highlightedLines?.[i] ?? "";
            return (
              <div key={i} className={lineClass}>
                <span className="line-number">{lineNum}</span>
                <span
                  className="line-text"
                  dangerouslySetInnerHTML={{
                    __html: highlightedHtml || " ",
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pane-content pane-placeholder">
          <div className="placeholder-icon">🔵</div>
          <div className="placeholder-text">
            BASE version is unavailable
          </div>
          <div className="placeholder-sub">
            Run <code>git config merge.conflictStyle zdiff3</code> or
            open a file with <code>MERGE_HEAD</code> present
          </div>
        </div>
      )}
    </div>
  );
}
