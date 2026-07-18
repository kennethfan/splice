import { useEffect } from "react";

export interface KeyboardHandlers {
  onNextConflict: () => void;
  onPrevConflict: () => void;
  onAcceptLocal: () => void;
  onAcceptRemote: () => void;
  onAcceptBoth: () => void;
  onMagicMerge: () => void;
  onSave: () => void;
  onOpenFile: () => void;
  onOpenDirectory: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleBasePanel: () => void;
  onOpenOverview: () => void;
  onCloseTab: () => void;
  onToggleDebug?: () => void;
  onManualEdit?: () => void;
}

/**
 * Global keyboard shortcut handler.
 * Binds Cmd+ key combinations to handler functions.
 */
export function useKeyboard(handlers: KeyboardHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      const meta = e.metaKey || e.ctrlKey;

      if (meta) {
        switch (e.key.toLowerCase()) {
          case "'":
            e.preventDefault();
            handlers.onAcceptLocal();
            break;
          case ";":
            e.preventDefault();
            handlers.onAcceptBoth();
            break;
          case ".":
            e.preventDefault();
            handlers.onAcceptRemote();
            break;
          case "m":
            e.preventDefault();
            handlers.onMagicMerge();
            break;
          case "s":
            e.preventDefault();
            handlers.onSave();
            break;
          case "o":
            e.preventDefault();
            if (e.shiftKey) {
              handlers.onOpenDirectory();
            } else {
              handlers.onOpenFile();
            }
            break;
          case "z":
            e.preventDefault();
            if (e.shiftKey) {
              handlers.onRedo();
            } else {
              handlers.onUndo();
            }
            break;
          case "\\":
            e.preventDefault();
            handlers.onToggleBasePanel();
            break;
          case "p":
            e.preventDefault();
            handlers.onOpenOverview();
            break;
          case "w":
            e.preventDefault();
            handlers.onCloseTab();
            break;
          case "d":
            if (e.shiftKey) {
              e.preventDefault();
              handlers.onToggleDebug?.();
            }
            break;
          case "e":
            e.preventDefault();
            handlers.onManualEdit?.();
            break;
        }
      } else {
        switch (e.key) {
          case "Tab":
            e.preventDefault();
            if (e.shiftKey) {
              handlers.onPrevConflict();
            } else {
              handlers.onNextConflict();
            }
            break;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
