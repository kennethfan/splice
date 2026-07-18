# ADR 001: Directory Open Experience

**Status**: Proposed
**Date**: 2026-07-18
**Driver**: User selected "Option B" — quick inject watcher when opening a directory

## Context

Currently Splice opens **one conflicted file at a time** via `Cmd+O` (native file dialog). The watcher flow exists but is secondary: user must click a "Watch" button in the status bar, then navigate to a repo, then open the WatchedRepoPanel to see files.

A user with a repo full of merge conflicts has no direct path to see them all. They must either:
1. Open each file individually via `Cmd+O`
2. Or know to start the watcher, add the repo, then open the panel

Both are too many steps.

## Decision

Add an "Open Directory" entry point that shortcuts into the watcher flow.

### Flow

```
User clicks "Open Directory" (or Cmd+Shift+O)
  → Native directory picker (select Git repo root)
  → If watcher not running → start it
  → addWatchedRepo(path)
  → Open WatchedRepoPanel
  → Fetch conflicted files
  → If exactly 1 conflict → auto-open it and close panel
  → If multiple conflicts → keep panel open, user picks one
```

### What changes

**1. New handler: `handleOpenDirectory` (App.tsx)**

Reuses `open()` from `@tauri-apps/plugin-dialog` with `{ directory: true }`. Same watcher wiring as `handleAddWatchedRepo` but additionally:
- Opens the WatchedRepoPanel automatically
- Fetches and auto-expands the repo's conflicted files
- Auto-opens if single conflict

**2. Welcome screen update**

The placeholder in the RESULT pane (lines 1623-1637 of App.tsx) currently shows:
```
Splice
Git Conflict Resolver
Cmd + O to open a file
[Configure Global Mergetool]
```

Add a second option:
```
📂 Open a Git Repository
Browse and resolve all conflicts in a repo
```

Layout: side-by-side with Configure Mergetool button.

**3. WatchedRepoPanel auto-expand**

After adding a repo via directory open, the panel should show the repo already expanded with its conflict files visible (no need for user to click the expand arrow).

Implementation: pass a `defaultExpandedPath` prop to `WatchedRepoPanel`, or have `handleOpenDirectory` pass an initial expanded state.

**4. Keyboard shortcut**

Add `Cmd+Shift+O` → `handleOpenDirectory` in the existing keyboard handler (useKeyboard.ts or the keydown listener in App.tsx).

### Non-goals

- No new Rust commands (all backend work is already in place via `startWatcher` / `addWatchedRepo` / `getWatchedRepoDetails` / `getRepoConflictedFiles`)
- No layout changes to the three-pane editor
- No changes to the watcher panel's existing behavior when accessed normally

### File changes summary

| File | Change |
|------|--------|
| `src/App.tsx` | Add `handleOpenDirectory`, add `Cmd+Shift+O` keyboard binding, update welcome screen JSX |
| `src/styles/splice.css` | Add styles for new welcome area button/action |
| `src/components/WatchedRepoPanel.tsx` | Add `defaultExpandedPath` prop support for auto-expand |
| `src/hooks/useKeyboard.ts` (optional) | Add `Cmd+Shift+O` binding if keyboard logic is there |

### Testing

- Unit test for `handleOpenDirectory` logic branch (single file auto-open, multiple files stay in panel)
- Visual: welcome screen renders both open options

## Consequences

- Users now have two clear paths: "open a file" or "open a repo"
- The watcher flow becomes a first-class entry point, not a hidden feature
- No backend changes required, minimal frontend delta (~100 lines new code)
- Single-file open remains untouched for existing workflow
