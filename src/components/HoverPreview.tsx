import { useMemo } from "react";
import type { ConflictBlock, BlockDiff, WordChange, LineDiff } from "../lib/tauri";
import { highlightLines } from "../lib/highlight";
import { DiffText } from "./DiffText";

/**
 * Given line-level diffs and word-change arrays, returns the word changes
 * for a specific line index, or null if the line is unchanged / no data.
 */
export function getWordChangesForLine(
  lineIndex: number,
  lineDiffs: LineDiff[],
  wordChanges: WordChange[][],
): WordChange[] | null {
  if (lineIndex < 0 || lineIndex >= lineDiffs.length) return null;
  if (lineDiffs[lineIndex] !== "Modified") return null;
  let modifiedCount = 0;
  for (let i = 0; i < lineIndex; i++) {
    if (lineDiffs[i] === "Modified") modifiedCount++;
  }
  return wordChanges[modifiedCount] ?? null;
}

interface HoverPreviewProps {
  action: "Local" | "Remote" | "Both";
  block: ConflictBlock;
  blockDiff?: BlockDiff | null;
}

export function HoverPreview({ action, block, blockDiff }: HoverPreviewProps) {
  let rawLines: string[];
  let lineDiffs: LineDiff[] | null = null;
  let wordChanges: WordChange[][] | null = null;
  let label: string;
  let labelClass: string;

  switch (action) {
    case "Local":
      rawLines = block.local_lines;
      lineDiffs = blockDiff?.local_vs_base ?? null;
      wordChanges = blockDiff?.local_word_changes ?? null;
      label = "Use Your Version";
      labelClass = "inline-preview-header--local";
      break;
    case "Remote":
      rawLines = block.remote_lines;
      lineDiffs = blockDiff?.remote_vs_base ?? null;
      wordChanges = blockDiff?.remote_word_changes ?? null;
      label = "Use Their Version";
      labelClass = "inline-preview-header--remote";
      break;
    case "Both":
      rawLines = block.local_lines.length > 0 && block.remote_lines.length > 0
        ? [...block.local_lines, "⟷", ...block.remote_lines]
        : block.local_lines.length > 0
          ? block.local_lines
          : block.remote_lines;
      label = "Keep Both Versions";
      labelClass = "inline-preview-header--both";
      break;
  }

  // Syntax-highlight the preview lines
  const previewText = rawLines.join("\n");
  const highlighted = useMemo(
    () => {
      if (rawLines.length === 0) return [];
      return highlightLines(previewText);
    },
    [previewText]
  );

  return (
    <div className="inline-preview">
      <div className={`inline-preview-header ${labelClass}`}>
        <span className="inline-preview-header-arrow">
          {action === "Local" && "← "}
          {action === "Both" && "↔ "}
          {action === "Remote" && "→ "}
        </span>
        {label}
      </div>
      <div className="inline-preview-body">
        {highlighted.length > 0 ? (
          highlighted.map((html, i) => {
            const line = rawLines[i] ?? "";
            const isSeparator = line === "⟷";

            let lineContent: React.ReactNode;
            if (isSeparator) {
              lineContent = null;
            } else if (lineDiffs && wordChanges && action !== "Both") {
              const wordData = getWordChangesForLine(
                i,
                lineDiffs,
                wordChanges,
              );
              if (wordData) {
                lineContent = <DiffText wordChanges={wordData} text={line} />;
              } else {
                lineContent = (
                  <span dangerouslySetInnerHTML={{ __html: html || " " }} />
                );
              }
            } else {
              lineContent = (
                <span dangerouslySetInnerHTML={{ __html: html || " " }} />
              );
            }

            return (
              <div
                key={i}
                className={
                  isSeparator
                    ? "inline-preview-line inline-preview-line--sep"
                    : "inline-preview-line"
                }
              >
                <span className="inline-preview-line-num">
                  {isSeparator ? "~" : String(i + 1).padStart(2, " ")}
                </span>
                <span className="inline-preview-line-text">
                  {isSeparator
                    ? "───── both ─────"
                    : lineContent
                  }
                </span>
              </div>
            );
          })
        ) : (
          <div className="inline-preview-line">
            <span className="inline-preview-line-num">  </span>
            <span className="inline-preview-line-text inline-preview-line-text--empty">
              (empty)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
