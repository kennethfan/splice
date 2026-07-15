/// A modal overlay listing all keyboard shortcuts, grouped by category.
/// Triggered by Cmd+/ or ? and dismissed by Escape, clicking the backdrop, or toggling again.

interface ShortcutEntry {
  keys: string;
  label: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Conflict Resolution",
    shortcuts: [
      { keys: "Cmd + '", label: "Accept local (yours)" },
      { keys: "Cmd + ;", label: "Accept both versions" },
      { keys: "Cmd + .", label: "Accept remote (theirs)" },
      { keys: "Cmd + M", label: "Magic Merge (auto-resolve)" },
      { keys: "Cmd + \\", label: "Toggle base panel" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "Tab", label: "Next conflict" },
      { keys: "Shift + Tab", label: "Previous conflict" },
      { keys: "Cmd + P", label: "Open overview sidebar" },
    ],
  },
  {
    title: "File",
    shortcuts: [
      { keys: "Cmd + O", label: "Open file" },
      { keys: "Cmd + S", label: "Save resolved file" },
      { keys: "Cmd + W", label: "Close tab" },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: "Cmd + Z", label: "Undo" },
      { keys: "Cmd + Shift + Z", label: "Redo" },
    ],
  },
  {
    title: "Settings",
    shortcuts: [
      { keys: "Cmd + Shift + M", label: "Toggle notification sound" },
      { keys: "Cmd + Shift + R", label: "Reset all settings" },
      { keys: "Cmd + Shift + D", label: "Toggle debug panel" },
      { keys: "Cmd + /", label: "Toggle this help" },
    ],
  },
];

interface ShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ isOpen, onClose }: ShortcutsOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div
        className="shortcuts-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        <div className="shortcuts-header">
          <span className="shortcuts-header-icon">⌨️</span>
          <span className="shortcuts-title">Keyboard Shortcuts</span>
          <button
            className="shortcuts-close"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            ×
          </button>
        </div>
        <div className="shortcuts-body">
          {GROUPS.map((group) => (
            <div key={group.title} className="shortcuts-group">
              <div className="shortcuts-group-title">{group.title}</div>
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.keys + shortcut.label} className="shortcuts-row">
                  <span className="shortcuts-keys">
                    {shortcut.keys.split(" + ").map((part, i) => (
                      <span key={i}>
                        {i > 0 && <span className="shortcuts-plus"> + </span>}
                        <kbd className="shortcuts-key">{part}</kbd>
                      </span>
                    ))}
                  </span>
                  <span className="shortcuts-label">{shortcut.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">
          Press <kbd className="shortcuts-key">Esc</kbd> or <kbd className="shortcuts-key">Cmd + /</kbd> to close
        </div>
      </div>
    </div>
  );
}
