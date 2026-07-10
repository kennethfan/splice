import { useState, useCallback, useRef } from "react";
import "./styles/splice.css";
import { ConflictBlock } from "./components/ConflictBlock";
import { ConflictNav } from "./components/ConflictNav";
import { useSyncScroll } from "./hooks/useSyncScroll";
import { useKeyboard } from "./hooks/useKeyboard";
import type { MergeSession, ResolveAction } from "./lib/tauri";
import { openFile, resolveConflict, magicMerge, saveFile } from "./lib/tauri";

function App() {
  const [session, setSession] = useState<MergeSession | null>(null);
  const [activeConflictIndex, setActiveConflictIndex] = useState(0);
  const [showBase, setShowBase] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef(0);

  const { refs, handleScroll } = useSyncScroll();

  // Filter to unresolved conflicts for navigation
  const unresolvedIndices = session
    ? session.conflicts
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.status === "Unresolved")
        .map(({ i }) => i)
    : [];

  const currentConflictIndex = unresolvedIndices.length > 0
    ? Math.min(activeConflictIndex, unresolvedIndices.length - 1)
    : -1;

  const currentConflictId = currentConflictIndex >= 0 && unresolvedIndices[currentConflictIndex] !== undefined
    ? session?.conflicts[unresolvedIndices[currentConflictIndex]]?.id ?? 0
    : 0;

  // Open file dialog via Tauri
  const handleOpenFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // For MVP, prompt the user for a file path
      // In a real Tauri app, we'd use the dialog plugin
      const path = window.prompt("Enter path to conflicted file:");
      if (!path) {
        setLoading(false);
        return;
      }
      const result = await openFile(path);
      sessionIdRef.current += 1;
      setSession(result);
      setActiveConflictIndex(0);
    } catch (err) {
      setError(String(err));
    }
    setLoading(false);
  }, []);

  // Resolve a conflict
  const handleResolve = useCallback(async (conflictId: number, action: ResolveAction) => {
    if (!session) return;
    try {
      const updated = await resolveConflict(sessionIdRef.current, conflictId, action);
      setSession(updated);
    } catch (err) {
      setError(String(err));
    }
  }, [session]);

  // Navigate to next conflict
  const handleNextConflict = useCallback(() => {
    if (unresolvedIndices.length <= 1) return;
    setActiveConflictIndex((prev) => Math.min(prev + 1, unresolvedIndices.length - 1));
  }, [unresolvedIndices.length]);

  // Navigate to previous conflict
  const handlePrevConflict = useCallback(() => {
    setActiveConflictIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  // Magic merge
  const handleMagicMerge = useCallback(async () => {
    if (!session) return;
    try {
      const updated = await magicMerge(sessionIdRef.current);
      setSession(updated);
      // Show result toast
      const resolved = updated.resolved_count;
      const remaining = updated.total_count - resolved;
      setError(
        remaining > 0
          ? `✨ Auto-resolved ${resolved} conflicts, ${remaining} remaining`
          : `✨ All ${resolved} conflicts resolved!`
      );
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      setError(String(err));
    }
  }, [session]);

  // Save
  const handleSave = useCallback(async () => {
    if (!session) return;
    try {
      await saveFile();
      setSession((prev) => (prev ? { ...prev, saved: true } : null));
    } catch (err) {
      setError(String(err));
    }
  }, [session]);

  // Accept local/remote/both for current conflict
  const handleAcceptLocal = useCallback(async () => {
    if (currentConflictId > 0) {
      await handleResolve(currentConflictId, "Local");
      handleNextConflict();
    }
  }, [currentConflictId, handleResolve, handleNextConflict]);

  const handleAcceptRemote = useCallback(async () => {
    if (currentConflictId > 0) {
      await handleResolve(currentConflictId, "Remote");
      handleNextConflict();
    }
  }, [currentConflictId, handleResolve, handleNextConflict]);

  const handleAcceptBoth = useCallback(async () => {
    if (currentConflictId > 0) {
      await handleResolve(currentConflictId, "Both");
      handleNextConflict();
    }
  }, [currentConflictId, handleResolve, handleNextConflict]);

  const handleUndo = useCallback(() => {
    // Not yet implemented on the backend side
    setError("Undo is not yet implemented");
    setTimeout(() => setError(null), 2000);
  }, []);

  const handleRedo = useCallback(() => {
    setError("Redo is not yet implemented");
    setTimeout(() => setError(null), 2000);
  }, []);

  const handleToggleBase = useCallback(() => {
    setShowBase((prev) => !prev);
  }, []);

  // Register keyboard shortcuts
  useKeyboard({
    onNextConflict: handleNextConflict,
    onPrevConflict: handlePrevConflict,
    onAcceptLocal: handleAcceptLocal,
    onAcceptRemote: handleAcceptRemote,
    onAcceptBoth: handleAcceptBoth,
    onMagicMerge: handleMagicMerge,
    onSave: handleSave,
    onOpenFile: handleOpenFile,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToggleBasePanel: handleToggleBase,
  });

  // Render file content lines with conflict highlighting
  const renderContent = (content: string) => {
    if (!session) return null;

    const lines = content.split("\n");
    return (
      <div className="pane-lines">
        {lines.map((line, i) => {
          const lineNum = i + 1;
          // Check if this line falls within any conflict block
          const inConflict = session.conflicts.find(
            (c) => lineNum >= c.start_line && lineNum <= c.end_line
          );
          const isActive = inConflict && inConflict.id === currentConflictId;

          let lineClass = "pane-line";
          if (inConflict) {
            if (inConflict.status !== "Unresolved") {
              lineClass += " pane-line--resolved";
            } else if (isActive) {
              lineClass += " pane-line--conflict-active";
            } else {
              lineClass += " pane-line--conflict";
            }
          }

          return (
            <div key={i} className={lineClass}>
              <span className="line-number">{lineNum}</span>
              <span className="line-text">{line || " "}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Render result content (with interactive conflict blocks)
  const renderResultContent = () => {
    if (!session) return null;

    const lines = session.all_local_content.split("\n");
    const result: React.ReactNode[] = [];

    // Walk through lines, inserting conflict blocks at the right positions
    const sortedConflicts = [...session.conflicts].sort((a, b) => a.start_line - b.start_line);
    let conflictIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const nextConflict = sortedConflicts[conflictIdx];

      if (nextConflict && lineNum === nextConflict.start_line) {
        // Insert the conflict block widget instead of the raw conflict markers
        const globalIndex = session.conflicts.findIndex((c) => c.id === nextConflict.id);
        result.push(
          <ConflictBlock
            key={`conflict-${nextConflict.id}`}
            block={nextConflict}
            isActive={nextConflict.id === currentConflictId}
            index={globalIndex + 1}
            total={session.conflicts.length}
            onResolve={handleResolve}
          />
        );
        conflictIdx += 1;

        // Skip directly to the line after the conflict block
        i = nextConflict.end_line - 1;
      } else {
        // Regular line
        result.push(
          <div key={`line-${i}`} className="pane-line pane-line--normal">
            <span className="line-number">{lineNum}</span>
            <span className="line-text">{lines[i] || " "}</span>
          </div>
        );
      }
    }

    return <div className="pane-lines">{result}</div>;
  };

  return (
    <div className="splice-layout">
      {/* Title Bar */}
      <div className="title-bar">
        <span className="title-bar-icon">⛓️</span>
        <span className="title-bar-text">Splice</span>
        {session && (
          <>
            <span className="title-bar-sep">—</span>
            <span className="title-bar-file">
              {session.file_path.split("/").pop()}
            </span>
          </>
        )}
        <div className="title-bar-spacer" />
        <span className="title-bar-status">
          {loading ? "● loading" : session ? "● ready" : "● idle"}
        </span>
      </div>

      {/* Three-Pane Area */}
      <div className={`panes ${showBase ? "panes--with-base" : ""}`}>
        {/* LOCAL */}
        <div
          className="pane pane-side"
          ref={refs.left}
          onScroll={() => handleScroll("left")}
        >
          <div className="pane-header">Local (Yours)</div>
          {session ? (
            renderContent(session.all_local_content)
          ) : (
            <div className="pane-content pane-placeholder">
              <div className="placeholder-icon">📂</div>
              <div className="placeholder-text">
                Drop a conflicted file here<br />
                or run <code>git mergetool</code>
              </div>
            </div>
          )}
        </div>

        {/* RESULT */}
        <div
          className="pane pane-result"
          ref={refs.center}
          onScroll={() => handleScroll("center")}
        >
          <div className="pane-header">Result</div>
          {session ? (
            renderResultContent()
          ) : (
            <div className="pane-content pane-placeholder">
              <div className="placeholder-icon">⛓️</div>
              <div className="placeholder-text">Splice</div>
              <div className="placeholder-sub">Git Conflict Resolver</div>
              <div className="placeholder-hint">
                <code>Cmd + O</code> to open a file
              </div>
            </div>
          )}
        </div>

        {/* REMOTE */}
        <div
          className="pane pane-side"
          ref={refs.right}
          onScroll={() => handleScroll("right")}
        >
          <div className="pane-header">Remote (Theirs)</div>
          {session ? (
            renderContent(session.all_remote_content)
          ) : (
            <div className="pane-content pane-placeholder">
              <div className="placeholder-icon">📂</div>
              <div className="placeholder-text">
                Waiting for conflicts<br />
                to resolve...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="toast">
          <span>{error}</span>
          <button className="toast-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Bottom Navigation */}
      <ConflictNav
        currentIndex={currentConflictIndex}
        totalCount={session?.conflicts.length ?? 0}
        resolvedCount={session?.resolved_count ?? 0}
        saved={session?.saved ?? false}
        hasSession={session !== null}
        onPrevConflict={handlePrevConflict}
        onNextConflict={handleNextConflict}
        onMagicMerge={handleMagicMerge}
        onSave={handleSave}
        onOpenFile={handleOpenFile}
      />
    </div>
  );
}

export default App;
