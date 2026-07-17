# ⛓️ Splice — Git Conflict Resolver

> A native macOS desktop application for resolving Git merge conflicts with a three-pane visual diff editor.

Splice replaces the confusing inline conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) with a clear side-by-side interface, letting you visually compare your changes (`Yours`) against incoming changes (`Theirs`) and the common ancestor (`Base`) to produce a clean merge result.

---

## ✨ Features

### 🎯 Why Splice?

Traditional conflict resolution means staring at a terminal full of `<<<<<<<`, `=======`, and `>>>>>>>` markers, manually editing the file to find the right combination. It's error-prone and slow. **Splice gives you a visual diff editor** that shows each version side-by-side with inline conflict actions, keyboard shortcuts for every operation, and a live preview of the merged result.

> **IntelliJ IDEA style merge tool, built as a standalone macOS app** — no IDE required.

---

### 🎯 Core Merge Experience

#### Three-pane visual diff

The main interface is split into three aligned panes:

| Pane | Position | Shows |
|------|----------|-------|
| **Yours (Current)** | Left | Your branch's version of the file |
| **Result** | Center | The evolving merge result |
| **Theirs (Merged)** | Right | The incoming branch's version |

Each pane scrolls in sync, and clicking a conflict in any pane highlights it across all three. An optional **Base** pane (common ancestor) can be toggled with `Cmd+\`.

#### One-click conflict resolution

Each conflict block in the side panes has **action buttons** (`>>` to accept, `✕` to ignore), inspired by IntelliJ IDEA's merge tool:

- **Yours side**: `>>` accepts your version, `✕` ignores it (uses theirs)
- **Theirs side**: `<<` accepts their version, `✕` ignores it (uses yours)
- Click only once per side per conflict — buttons disable after use
- Shows loading feedback (`◌` spinner) while the backend processes

#### Magic Merge

Click **Magic Merge** to automatically resolve all remaining conflicts. Splice uses heuristics to pick the correct version for each conflict, then lets you review and fix any that need manual attention. Magic Merge results can be fully **undone** with one click.

#### Undo / Redo

Full undo/redo stack (`Cmd+Z` / `Cmd+Shift+Z`) for all conflict resolution actions — accept, ignore, manual edit, and magic merge. Never worry about making a wrong choice.

---

### ✏️ Inline Editing

Splice supports two editing modes:

#### Unresolved conflicts — textarea + preview

Click **`✏ Edit Inline`** at the bottom of an unresolved conflict to open a textarea showing both versions with labels:

```
// ─── Your version ───
your_code_here
// ─── Their version ───
their_code_here
```

The editor includes a **live syntax-highlighted preview** that updates as you type. Press `Cmd+Enter` to apply, `Esc` to cancel.

#### Resolved conflicts — inline textarea

After resolving a conflict, you can continue editing the result **directly in place** — click anywhere on the green resolved text (or the ✏ button) to open an inline textarea. The editor uses a controlled `<textarea>` that correctly handles all code content (including HTML tags like `<div>`, `<T>`). A floating action bar (`✓ Save` / `✕ Cancel`) appears at the bottom. Press `Cmd+Enter` to save or `Esc` to cancel.

This makes it easy to:
- Tweak the merged result without re-resolving
- Manually blend both versions when neither side alone is sufficient
- Fix formatting after accepting a side

#### Manual resolve via dialog

For complex edits, click the **Manual Resolve** button to open a full dialog with a larger editing area, syntax highlighting, and the original conflict context.

---

### 🧑‍💻 Visual Feedback

| Feature | Description |
|---------|-------------|
| **Syntax highlighting** | Powered by highlight.js, supports all major languages (JavaScript, Rust, Python, Go, etc.) |
| **Resolved conflict badge** | Green `✓ Resolved` badge above each resolved block, showing the method (Yours / Theirs / Both / Manual) |
| **Conflict highlights** | Resolved lines get a green left border; unresolved conflicts highlighted in red/orange; Base pane shows light blue |
| **Click to highlight** | Click a conflict block in any side pane to flash-highlight (`✨` gold animation) the corresponding block in the result pane |
| **Loading feedback** | Buttons show `◌` spinner animation while the backend processes the resolution |
| **Automatic alignment** | After resolving, all three panes auto-scroll to show the same conflict block — even when content lengths differ |
| **File-level diff** | The status bar shows word-level diff statistics for each conflict |

---

### 🔄 Git Integration

#### `git mergetool` support

With one click, configure Splice as your global Git mergetool:

```bash
# The app runs this for you:
git config --global merge.tool splice
git config --global mergetool.splice.cmd '/Applications/Splice.app/Contents/MacOS/splice ...'
```

After configuration, simply run `git mergetool` in any conflicted repo — Splice launches automatically with the file loaded.

#### Real-time conflict detection

Splice includes a **background file watcher** that monitors configured Git repositories for new conflict markers:

1. Click the **Watch** button in the status bar
2. Select a Git repository directory
3. Splice monitors that repo and shows a desktop notification when new conflicts appear

The watcher panel lists all tracked repositories, shows the number of pending conflicts, and lets you open any conflicted file with one click.

#### Git hooks auto-launch

Toggle **Auto-launch** in the status bar to install Git hooks that automatically open Splice when a `git merge` produces conflicts. No need to run `git mergetool` manually.

#### Branch-aware display

Side pane headers and conflict markers show actual branch names from Git:

- `Yours (Current)` → `main` (your current branch)
- `Theirs (Merged)` → `feature/new-api` (the branch being merged)
- Conflict markers use branch names instead of generic labels

---

### ⌨️ Keyboard Shortcuts

Splice is designed for keyboard-first power users. Every action has a shortcut. Press **`Cmd+/`** or **`?`** at any time to open the interactive shortcuts overlay.

#### Quick reference

| Shortcut | Action |
|----------|--------|
| `Cmd + '` | Accept local (yours) |
| `Cmd + ;` | Accept both versions |
| `Cmd + .` | Accept remote (theirs) |
| `Cmd + M` | Magic Merge (auto-resolve all) |
| `Cmd + E` | Open inline editor for current conflict |
| `Cmd + \\` | Toggle Base pane |
| `Tab` | Next conflict |
| `Shift + Tab` | Previous conflict |
| `Cmd + P` | Open conflict overview sidebar |
| `Cmd + O` | Open a conflicted file |
| `Cmd + S` | Save the resolved file |
| `Cmd + W` | Close the active tab |
| `Cmd + Z` | Undo last resolution |
| `Cmd + Shift + Z` | Redo last undo |
| `Cmd + Shift + D` | Toggle debug panel |
| `Cmd + /` or `?` | Toggle this shortcuts overlay |

#### In-editor shortcuts

The following shortcuts work while editing conflict content in the inline editor:

| Shortcut | Action |
|----------|--------|
| `Cmd + Enter` | Confirm / Save the edited content |
| `Esc` | Cancel editing, restore original |

#### Grouped by category

| Category | Shortcut | Action |
|----------|----------|--------|
| **File** | `Cmd+O` | Open a conflicted file |
| | `Cmd+W` | Close the active tab |
| | `Cmd+S` | Save the resolved file |
| **Navigation** | `Tab` | Next conflict |
| | `Shift+Tab` | Previous conflict |
| | `Cmd+P` | Open conflict overview sidebar |
| | `Cmd+\\` | Toggle Base pane |
| **Resolution** | `Cmd+'` | Accept yours (local) |
| | `Cmd+;` | Accept both |
| | `Cmd+.` | Accept theirs (remote) |
| | `Cmd+M` | Magic merge (auto-resolve) |
| | `Cmd+E` | Edit current conflict inline |
| | `Cmd+Enter` | Confirm inline edit |
| **History** | `Cmd+Z` | Undo last resolution |
| | `Cmd+Shift+Z` | Redo last undo |
| **Help** | `Cmd+/` or `?` | Show shortcuts overlay |
| **Debug** | `Cmd+Shift+D` | Toggle debug panel |

---

### 📁 Multi-file workflow

Splice supports opening multiple conflicted files simultaneously with a **tabbed interface**:

- Each tab maintains its own conflict state, undo history, and scroll position
- Switch between tabs with keyboard shortcuts or mouse clicks
- Close tabs with `Cmd+W` or the × button
- The status bar shows global progress across all open files

---

### 🔍 Conflict Overview

Click the **overview sidebar** button (or use `Cmd+Shift+O`) to see a summary of all conflicts in the current file:

- Lists each conflict with its line number and current status (resolved / unresolved)
- Color-coded: red for unresolved, green for resolved
- Click any entry to jump directly to that conflict
- Shows total count and resolution progress

---

## 📦 Installation

### Via DMG (recommended)

1. Download the latest `.dmg` from the [Releases](https://github.com/your-org/splice/releases) page
2. Open the `.dmg` and drag `Splice.app` to your `Applications` folder
3. Right-click `Splice.app` and select **Open** (first launch only, to bypass Gatekeeper)

### From source

```bash
# Prerequisites: Rust, Node.js, and system dependencies for Tauri v2
# See: https://v2.tauri.app/start/prerequisites/

git clone https://github.com/your-org/splice.git
cd splice
npm install
npx tauri build
cp -R src-tauri/target/release/bundle/macos/Splice.app /Applications/
```

---

## 🚀 Usage

### Quick start

1. **Open Splice** — You'll see the welcome screen with a `Configure Global Mergetool` button
2. **Configure git** — Click the button to set Splice as your default mergetool (`git config --global merge.tool splice`)
3. **Open a conflicted file** — Press `Cmd+O` or click the status bar button, and select a file with Git conflict markers

### Using with `git mergetool`

After configuring Splice as your mergetool, simply run:

```bash
git mergetool
```

Splice will automatically open with the conflicted file loaded.

### Using the file watcher

1. Click the **Watch** button in the status bar
2. Select a Git repository directory
3. Splice will monitor that repo and notify you when new conflicts are detected

### Manually editing a conflict

- **Unresolved conflicts**: Click the `✏ Edit Inline` button at the bottom of the conflict region to edit with a syntax-highlighted textarea
- **Resolved conflicts**: Click anywhere on the green resolved text to edit it in-place (inline textarea)
- Press `Cmd+Enter` to confirm, `Esc` to cancel

---

## 🏗 Architecture

```
splice/
├── src/                          # Frontend (React + TypeScript)
│   ├── App.tsx                   # Main application component
│   ├── main.tsx                  # Entry point
│   ├── components/               # React components
│   │   ├── BasePane.tsx          # Base (common ancestor) pane
│   │   ├── ConflictBlock.tsx     # Individual conflict block
│   │   ├── ConflictOverview.tsx  # Sidebar overview of all conflicts
│   │   ├── DiffText.tsx          # Word-level diff visualization
│   │   ├── HoverPreview.tsx      # Hover preview for side panels
│   │   ├── MagicMergeDialog.tsx  # Magic merge result dialog
│   │   ├── ManualResolveDialog.tsx # Manual resolve dialog
│   │   ├── ShortcutsOverlay.tsx  # Keyboard shortcuts help overlay
│   │   ├── StatusBar.tsx         # Bottom status bar
│   │   ├── TabBar.tsx            # Multi-file tab bar
│   │   └── WatchedRepoPanel.tsx  # Watched repositories panel
│   ├── hooks/                    # Custom React hooks
│   │   ├── useBlockDiffs.ts      # Word-level diff computation
│   │   ├── useKeyboard.ts        # Keyboard shortcut registration
│   │   └── useSyncScroll.ts      # Three-pane scroll synchronization
│   ├── lib/                      # Utilities
│   │   ├── highlight.ts         # Syntax highlighting (highlight.js)
│   │   ├── sound.ts             # Notification sound effects
│   │   └── tauri.ts             # Tauri IPC command bindings
│   └── styles/
│       └── splice.css           # All application styles
├── src-tauri/                    # Backend (Rust)
│   └── src/
│       ├── main.rs              # Tauri app entry point
│       ├── lib.rs               # Plugin registration
│       ├── commands/            # Tauri IPC commands
│       │   ├── close_session.rs
│       │   ├── configure_mergetool.rs
│       │   ├── diff_cmd.rs
│       │   ├── get_base.rs
│       │   ├── initial_session.rs
│       │   ├── magic_merge.rs
│       │   ├── open_file.rs
│       │   ├── resolve.rs
│       │   ├── save.rs
│       │   └── undo.rs
│       ├── diff/                # Diff engine
│       │   ├── engine.rs
│       │   └── mod.rs
│       ├── git/                 # Git integration
│       │   ├── mergetool.rs
│       │   └── mod.rs
│       ├── parser/              # Conflict marker parser
│       │   ├── conflict.rs
│       │   ├── lexer.rs
│       │   └── mod.rs
│       └── watcher.rs           # File system watcher
└── test/                        # Test fixtures
```

### Key design decisions

- **Three-pane layout** — Inspired by IntelliJ IDEA's merge tool. The side panels show YOURS and THEIRS unchanged, while the center panel shows the evolving RESULT.
- **Conflict markers** — The Rust backend parses `<<<<<<<` / `=======` / `>>>>>>>` markers and presents them as structured `ConflictBlock` objects to the frontend.
- **Scroll sync** — Uses `data-conflict-id` attributes instead of proportional ratio to keep all three panes aligned on the same conflict block (works even when resolved content has different lengths).
- **Inline editing** — Uses controlled `<textarea>` for both resolved and unresolved content. Resolved conflicts open a lightweight inline textarea; unresolved conflicts use a textarea with a live syntax-highlighted preview. Both correctly handle HTML tags in code.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop shell** | [Tauri v2](https://v2.tauri.app/) |
| **Frontend** | React 19 + TypeScript 5.8 |
| **Backend** | Rust with [git2](https://github.com/rust-lang/git2-rs) |
| **Diff engine** | [imara-diff](https://crates.io/crates/imara-diff) |
| **Syntax highlighting** | [highlight.js](https://highlightjs.org/) 11 |
| **Build tool** | Vite 7 |
| **Testing** | Vitest (frontend) + Cargo (backend) |

---

## 🔨 Building & Packaging

### Prerequisites

- **Rust** (via [rustup](https://rustup.rs/))
- **Node.js** >= 18
- **macOS system deps** — Xcode Command Line Tools (`xcode-select --install`)

For other platforms, see the [Tauri v2 prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### Development

```bash
# Install frontend dependencies
npm install

# Start in development mode (hot-reload)
npm run tauri:dev
# or: bash scripts/tauri-dev.sh
```

### Production build

```bash
# 1. Build the frontend and compile the native binary
npx tauri build

# 2. The built .app bundle will be at:
#    src-tauri/target/release/bundle/macos/Splice.app
#
# 3. Install it to /Applications:
cp -R src-tauri/target/release/bundle/macos/Splice.app /Applications/

# 4. Launch:
open /Applications/Splice.app
```

### Quick build & install (one-liner)

```bash
npx tauri build && cp -R src-tauri/target/release/bundle/macos/Splice.app /Applications/
```

### Build outputs

| Artifact | Path |
|----------|------|
| **.app bundle** | `src-tauri/target/release/bundle/macos/Splice.app` |
| **.dmg image** | `src-tauri/target/release/bundle/dmg/Splice_0.1.0_x64.dmg` |
| **Rust binary** | `src-tauri/target/release/splice` (debug at `target/debug/splice`) |

### Installer script

An automated installer is also available:

```bash
bash scripts/splice-install.sh
```

This script will:
1. Locate or build the Splice binary
2. Configure `git` to use Splice as the default mergetool
3. Optionally create a symlink in your PATH

---

## 🧪 Testing

```bash
# Frontend tests (Vitest)
npx vitest run

# Backend tests (Cargo)
cd src-tauri && cargo test

# Full type check
npx tsc --noEmit

# Run all checks before committing
npx vitest run && cd src-tauri && cargo test && cd .. && npx tsc --noEmit
```

---

## 📊 Project Status

| Check | Status |
|-------|--------|
| **TypeScript** | ✅ Zero errors |
| **Frontend tests** | ✅ 126/126 passing |
| **Rust tests** | ✅ 20/20 passing |
| **Tauri build** | ✅ Successful |

### Bug fixes (10 fixed)

| # | Bug | Root cause |
|---|-----|------------|
| 1 | **Content loss after resolve** | `lineIdx` advanced by display lines instead of local lines |
| 2 | **Side pane code offset** | For-loop `continue` caused extra +1, skipping one line per conflict |
| 3 | **Rust backend marker replacement** | Multi-conflict `>>>>>>>` line counting off-by-one in `save.rs` |
| 4 | **Button click no response** | `programmaticScrollRef` RAF race condition stuck at `true` |
| 5 | **Safety timer leak** | Effect cleanup didn't cancel old 500ms timer |
| 6 | **Undo button state not restored** | `usedSides` ref not cleared on undo/redo |
| 7 | **Undo inline editor not closed** | `inlineEditId`/`inlineEditText` not reset on undo/redo |
| 8 | **Undo magic merge buttons broken** | `handleUndoMagic` didn't clear `usedSides` |
| 9 | **HTML tags in inline editor** | `dangerouslySetInnerHTML` interpreted code `<tags>` as HTML |
| 10 | **Content lost on save** | contentEditable div cleared by React re-render (empty vDOM children) |

---

## 🔜 Roadmap

- [ ] Color-coded conflict markers (red for Yours, green for Theirs)
- [ ] Collapsible conflict blocks in side panes
- [ ] Cmd+number shortcuts to jump to a specific conflict
- [ ] Improved diff visualization (word-level diffs inline)
- [ ] Dark/light theme toggle

---

## 📝 License

APACHE 2.0
