# Git Blame Info in Conflict Blocks

## Summary

Add git blame information (author, date, commit hash) to the local and remote columns of conflict blocks in Splice's three-pane diff view. Each line of code shows who wrote it and when, helping developers understand conflict context.

## Design

### Data Model

**Rust** (`src-tauri/src/parser/conflict.rs`):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlameLine {
    pub line_number: usize,
    pub author: String,
    pub time: String,        // "2026-07-15" format
    pub commit_hash: String, // first 7 chars
}

pub struct BlameResult {
    pub local: HashMap<usize, BlameLine>,
    pub remote: HashMap<usize, BlameLine>,
}
```

**TypeScript** (`src/lib/tauri.ts`):

```typescript
export interface BlameLine {
  line_number: number;
  author: string;
  time: string;
  commit_hash: string;
}
```

`HashMap<usize, BlameLine>` enables O(1) lookup by line number when rendering each line.

### Rust Command

New file: `src-tauri/src/commands/blame.rs`

```rust
#[tauri::command]
pub fn get_blame(file_path: String) -> Result<BlameResult, String>
```

- **local**: `git2::Blame::open()` on the working tree file
- **remote**: `git2::Blame::open()` against the MERGE_HEAD revision (or empty if not in merge)
- `extract_blame_lines()` iterates over blame hunks, mapping `final_start_line` → `BlameLine`
- Time formatted as `YYYY-MM-DD` (no relative time)

Registration: `commands/mod.rs` → `pub mod blame` + `lib.rs` invoke_handler.

### Frontend Integration

**Data flow**:

1. User opens file → App calls `open_file()` + `get_blame()` in parallel
2. Blame data stored in `App.tsx` state: `Record<string, BlameResult>` keyed by filePath
3. Passed down to `BasePane` → `ConflictBlock` → `DiffText` via props

**App.tsx**:

```typescript
const [blameData, setBlameData] = useState<Record<string, BlameResult>>({});

async function openFile(filePath: string) {
  const [session, blame] = await Promise.all([
    openFileViaTauri(filePath),
    invoke<BlameResult>("get_blame", { filePath }),
  ]);
  setBlameData(prev => ({ ...prev, [filePath]: blame }));
  // ...
}
```

### UI Layout

Right-side info column in `DiffText.tsx`. Each code line gets a small gray annotation showing blame info:

```
<line-number>  <code>                    <blame-info>
12             const handleSubmit = (e)  alice·2026-07-15·a1b2c3d
13               e.preventDefault()      bob·2026-07-14·c3d4e5
```

**`DiffText.tsx` props** — new optional `blame?: Map<number, BlameLine>` and `side: 'local' | 'remote'` to pick the right blame map.

**CSS** — `.blame-info` uses smaller font size, muted color (#6c7086), right-aligned.

### Files Changed

| File | Change |
|------|--------|
| `src-tauri/src/commands/blame.rs` | New — `get_blame` command |
| `src-tauri/src/commands/mod.rs` | Add `pub mod blame` |
| `src-tauri/src/lib.rs` | Register `get_blame` in invoke_handler |
| `src-tauri/src/parser/conflict.rs` | Add `BlameLine`, `BlameResult` structs |
| `src/lib/tauri.ts` | Add `BlameLine` interface, `get_blame` wrapper |
| `src/App.tsx` | Add `blameData` state, load blame on file open |
| `src/components/DiffText.tsx` | Add `blame` prop, render blame-info column |
| `src/components/BasePane.tsx` | Pass blame data to DiffText |
| `src/components/ConflictBlock.tsx` | Pass blame data to DiffText |
| `src/styles/splice.css` | `.blame-info` styling |
