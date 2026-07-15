import { useState, useRef, useEffect } from "react";
import type { ConflictBlock } from "../lib/tauri";

interface Props {
  block: ConflictBlock;
  onConfirm: (content: string) => void;
  onCancel: () => void;
}

export function ManualResolveDialog({ block, onConfirm, onCancel }: Props) {
  const [content, setContent] = useState(() => {
    // Pre-fill with local + remote content
    const lines: string[] = [];
    if (block.local_lines.length > 0) {
      if (block.remote_lines.length > 0) {
        lines.push("// ─── Your version ───");
        lines.push(...block.local_lines);
        lines.push("// ─── Their version ───");
        lines.push(...block.remote_lines);
      } else {
        lines.push(...block.local_lines);
      }
    } else if (block.remote_lines.length > 0) {
      lines.push(...block.remote_lines);
    }
    return lines.join("\n");
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd+Enter or Ctrl+Enter to confirm
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onConfirm(content);
    }
    // Escape to cancel
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="manual-overlay" onClick={onCancel}>
      <div className="manual-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="manual-header">
          <span className="manual-icon">✏️</span>
          <span className="manual-title">Manual Resolution</span>
          <button className="manual-close" onClick={onCancel}>×</button>
        </div>

        <div className="manual-body">
          <div className="manual-info">
            <span className="manual-info-label">Conflict:</span>
            <span className="manual-info-text">
              Lines {block.start_line}–{block.end_line}
            </span>
          </div>
          <div className="manual-info">
            <span className="manual-info-label">Yours:</span>
            <span className="manual-info-text">
              {block.local_lines.length} line{block.local_lines.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="manual-info">
            <span className="manual-info-label">Theirs:</span>
            <span className="manual-info-text">
              {block.remote_lines.length} line{block.remote_lines.length !== 1 ? "s" : ""}
            </span>
          </div>

          <label className="manual-textarea-label">
            Enter the resolved content below (Cmd+Enter to confirm)
          </label>
          <textarea
            ref={textareaRef}
            className="manual-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            placeholder="Type your merged content here..."
          />
        </div>

        <div className="manual-footer">
          <button className="btn btn-undo" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-confirm"
            onClick={() => onConfirm(content)}
            disabled={!content.trim()}
          >
            ✓ Apply Resolution
          </button>
        </div>
      </div>
    </div>
  );
}
