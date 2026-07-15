import type { WordChange } from "../lib/tauri";

interface DiffTextProps {
  /** The word-level changes for this line, or null if line is unchanged / no diff data */
  wordChanges: WordChange[] | null;
  /** The original line text (fallback if no wordChanges) */
  text: string;
}

/**
 * Renders a line of text with inline word-level diff highlighting.
 * - Unchanged words: normal text
 * - Added words: green background
 * - Removed words: red background (strikethrough)
 * - Modified words: yellow background
 *
 * If wordChanges is null, the line is rendered as plain text (unchanged).
 */
export function DiffText({ wordChanges, text }: DiffTextProps) {
  if (!wordChanges || wordChanges.length === 0) {
    return <span className="diff-text">{text}</span>;
  }

  return (
    <span className="diff-text">
      {wordChanges.map((change, i) => {
        let className = "diff-word";
        switch (change.status) {
          case "added":
            className += " diff-word--added";
            break;
          case "removed":
            className += " diff-word--removed";
            break;
          case "modified":
            className += " diff-word--modified";
            break;
          // "unchanged" — no extra class
        }
        return (
          <span key={i} className={className}>
            {change.text}
          </span>
        );
      })}
    </span>
  );
}
