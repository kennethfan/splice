use serde::{Deserialize, Serialize};

/// A single conflict block extracted from a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictBlock {
    /// Sequential id, starting from 1
    pub id: usize,
    /// Lines from the local (current) branch
    pub local_lines: Vec<String>,
    /// Lines from the merge base (common ancestor), if available
    pub base_lines: Option<Vec<String>>,
    /// Lines from the remote (incoming) branch
    pub remote_lines: Vec<String>,
    /// Current resolution status
    pub status: ConflictStatus,
    /// The line number in the result file where this block starts
    pub start_line: usize,
    /// The line number in the result file where this block ends
    pub end_line: usize,
}

/// Resolution state of a conflict block.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ConflictStatus {
    #[serde(rename = "Unresolved")]
    Unresolved,
    #[serde(rename = "ResolvedWithLocal")]
    ResolvedWithLocal,
    #[serde(rename = "ResolvedWithRemote")]
    ResolvedWithRemote,
    #[serde(rename = "ResolvedWithBoth")]
    ResolvedWithBoth,
    #[serde(rename = "ResolvedManual")]
    ResolvedManual(String),
}

/// A record of an operation that can be undone/redone.
/// Stores the conflict statuses *before* the operation was applied.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoEntry {
    /// Human-readable description (for future display)
    pub description: String,
    /// Statuses before the operation, keyed by conflict_id
    pub statuses: Vec<(usize, ConflictStatus)>,
}

/// The complete state of a single merge session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeSession {
    /// Path to the file being merged
    pub file_path: String,
    /// File extension for syntax highlighting
    pub file_extension: String,
    /// All detected conflict blocks
    pub conflicts: Vec<ConflictBlock>,
    /// Complete content of the LOCAL version
    pub all_local_content: String,
    /// Complete content of the REMOTE version
    pub all_remote_content: String,
    /// Complete content of the BASE version (may be None if unavailable)
    pub all_base_content: Option<String>,
    /// The original file content (with conflict markers), used for save reconstruction
    pub original_content: String,
    /// Number of resolved conflicts
    pub resolved_count: usize,
    /// Total number of conflicts
    pub total_count: usize,
    /// Whether the file has been saved after the last change
    pub saved: bool,
    /// Stack of undoable actions
    #[serde(default)]
    pub undo_stack: Vec<UndoEntry>,
    /// Stack of redoable actions
    #[serde(default)]
    pub redo_stack: Vec<UndoEntry>,
}

/// Result returned by the magic merge operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MagicMergeResult {
    /// How many conflicts were auto-resolved
    pub auto_resolved: usize,
    /// How many conflicts still need manual handling
    pub remaining: usize,
}

impl ConflictBlock {
    /// Create a new unresolved conflict block.
    pub fn new(
        id: usize,
        local_lines: Vec<String>,
        base_lines: Option<Vec<String>>,
        remote_lines: Vec<String>,
        start_line: usize,
        end_line: usize,
    ) -> Self {
        ConflictBlock {
            id,
            local_lines,
            base_lines,
            remote_lines,
            status: ConflictStatus::Unresolved,
            start_line,
            end_line,
        }
    }

    /// Check if this conflict has been resolved.
    pub fn is_resolved(&self) -> bool {
        !matches!(self.status, ConflictStatus::Unresolved)
    }
}

impl MergeSession {
    /// Create a new merge session from parsed content.
    ///
    /// `original_content` is the raw file content **with conflict markers**.
    /// It is used by `build_result_content` to reconstruct the resolved file.
    /// When the session is created from a `open_file` call, this should be the
    /// raw file content read from disk.
    pub fn new(
        file_path: String,
        conflicts: Vec<ConflictBlock>,
        all_local_content: String,
        all_remote_content: String,
        all_base_content: Option<String>,
        original_content: String,
    ) -> Self {
        let total_count = conflicts.len();
        let file_extension = std::path::Path::new(&file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_string();

        MergeSession {
            file_path,
            file_extension,
            conflicts,
            all_local_content,
            all_remote_content,
            all_base_content,
            original_content,
            resolved_count: 0,
            total_count,
            saved: false,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    /// Update resolved_count based on current conflict states.
    pub fn recount(&mut self) {
        self.resolved_count = self
            .conflicts
            .iter()
            .filter(|c| c.is_resolved())
            .count();
    }

    /// Resolve a conflict by id and auto-update counts.
    /// Returns the previous status if the conflict was found.
    pub fn resolve_conflict(
        &mut self,
        conflict_id: usize,
        new_status: ConflictStatus,
    ) -> Option<ConflictStatus> {
        let conflict = self.conflicts.iter_mut().find(|c| c.id == conflict_id)?;
        let prev = std::mem::replace(&mut conflict.status, new_status);
        self.recount();
        self.saved = false;
        Some(prev)
    }

    /// Get a mutable reference to a conflict by id, without auto-recounting.
    pub fn conflict_mut(&mut self, conflict_id: usize) -> Option<&mut ConflictBlock> {
        self.conflicts.iter_mut().find(|c| c.id == conflict_id)
    }

    /// Push an undo entry and clear the redo stack (new action invalidates redo).
    pub fn push_undo(&mut self, entry: UndoEntry) {
        self.undo_stack.push(entry);
        self.redo_stack.clear();
    }

    /// Undo the last action. Returns the description of the undone action.
    /// Stores the current statuses into the redo stack so the action can be redone.
    pub fn undo(&mut self) -> Option<String> {
        let entry = self.undo_stack.pop()?;
        let desc = entry.description.clone();

        // Snapshot current statuses for redo before restoring
        let current_statuses: Vec<(usize, ConflictStatus)> = entry
            .statuses
            .iter()
            .map(|(id, _)| {
                let status = self
                    .conflicts
                    .iter()
                    .find(|c| c.id == *id)
                    .map(|c| c.status.clone())
                    .unwrap_or(ConflictStatus::Unresolved);
                (*id, status)
            })
            .collect();

        // Restore previous statuses
        for (id, status) in &entry.statuses {
            if let Some(conflict) = self.conflicts.iter_mut().find(|c| c.id == *id) {
                conflict.status = status.clone();
            }
        }

        // Push to redo stack
        self.redo_stack.push(UndoEntry {
            description: desc.clone(),
            statuses: current_statuses,
        });

        self.recount();
        self.saved = false;
        Some(desc)
    }

    /// Redo a previously undone action.
    pub fn redo(&mut self) -> Option<String> {
        let entry = self.redo_stack.pop()?;
        let desc = entry.description.clone();

        // Snapshot current statuses for undo before re-applying
        let current_statuses: Vec<(usize, ConflictStatus)> = entry
            .statuses
            .iter()
            .map(|(id, _)| {
                let status = self
                    .conflicts
                    .iter()
                    .find(|c| c.id == *id)
                    .map(|c| c.status.clone())
                    .unwrap_or(ConflictStatus::Unresolved);
                (*id, status)
            })
            .collect();

        // Re-apply the operation's statuses
        for (id, status) in &entry.statuses {
            if let Some(conflict) = self.conflicts.iter_mut().find(|c| c.id == *id) {
                conflict.status = status.clone();
            }
        }

        // Push back to undo stack
        self.undo_stack.push(UndoEntry {
            description: desc.clone(),
            statuses: current_statuses,
        });

        self.recount();
        self.saved = false;
        Some(desc)
    }
}

#[cfg(test)]
mod session_tests {
    use super::*;

    fn make_conflict(id: usize, start: usize, end: usize) -> ConflictBlock {
        ConflictBlock::new(
            id,
            vec![format!("local_{}", id)],
            Some(vec![format!("base_{}", id)]),
            vec![format!("remote_{}", id)],
            start,
            end,
        )
    }

    #[test]
    fn test_new_session_counts() {
        let conflicts = vec![
            make_conflict(1, 1, 5),
            make_conflict(2, 10, 14),
        ];
        let session = MergeSession::new(
            "/path/to/file.ts".to_string(),
            conflicts,
            "local full".to_string(),
            "remote full".to_string(),
            Some("base full".to_string()),
            String::new(),
        );
        assert_eq!(session.file_extension, "ts");
        assert_eq!(session.total_count, 2);
        assert_eq!(session.resolved_count, 0);
        assert!(!session.saved);
        assert!(session.undo_stack.is_empty());
        assert!(session.redo_stack.is_empty());
    }

    #[test]
    fn test_new_session_no_base() {
        let session = MergeSession::new(
            "file.js".to_string(),
            vec![],
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );
        assert!(session.all_base_content.is_none());
        assert_eq!(session.file_extension, "js");
    }

    #[test]
    fn test_resolve_conflict_returns_previous_status() {
        let conflicts = vec![make_conflict(1, 1, 5)];
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            conflicts,
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );

        let prev = session.resolve_conflict(1, ConflictStatus::ResolvedWithLocal);
        assert_eq!(prev, Some(ConflictStatus::Unresolved));
        assert_eq!(session.resolved_count, 1);
        assert!(!session.saved); // resolve sets saved = false
    }

    #[test]
    fn test_resolve_nonexistent_conflict() {
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            vec![],
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );
        let prev = session.resolve_conflict(42, ConflictStatus::ResolvedWithLocal);
        assert!(prev.is_none());
    }

    #[test]
    fn test_recount_after_multiple_resolves() {
        let conflicts = vec![
            make_conflict(1, 1, 5),
            make_conflict(2, 10, 14),
            make_conflict(3, 20, 24),
        ];
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            conflicts,
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );

        session.resolve_conflict(1, ConflictStatus::ResolvedWithLocal);
        session.resolve_conflict(3, ConflictStatus::ResolvedWithRemote);
        assert_eq!(session.resolved_count, 2);

        // Undo both (need undo entries to actually undo)
        // Since resolve_conflict does NOT auto-push to undo_stack,
        // manually push entries to test recount behavior on undo
        session.push_undo(UndoEntry {
            description: "Resolve 3".to_string(),
            statuses: vec![(3, ConflictStatus::Unresolved)],
        });
        session.resolve_conflict(3, ConflictStatus::ResolvedWithRemote);
        // revert back
        session.undo();
        assert_eq!(session.resolved_count, 1);
    }

    #[test]
    fn test_undo_redo_roundtrip() {
        let conflicts = vec![make_conflict(1, 1, 5)];
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            conflicts,
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );

        // Resolve with Local
        session.resolve_conflict(1, ConflictStatus::ResolvedWithLocal);
        session.push_undo(UndoEntry {
            description: "Resolve 1 with Local".to_string(),
            statuses: vec![(1, ConflictStatus::Unresolved)],
        });
        assert_eq!(session.resolved_count, 1);

        // Undo
        let desc = session.undo();
        assert_eq!(desc, Some("Resolve 1 with Local".to_string()));
        assert_eq!(session.resolved_count, 0);
        assert!(matches!(session.conflicts[0].status, ConflictStatus::Unresolved));

        // Redo
        let desc = session.redo();
        assert_eq!(desc, Some("Resolve 1 with Local".to_string()));
        assert_eq!(session.resolved_count, 1);
        assert!(matches!(session.conflicts[0].status, ConflictStatus::ResolvedWithLocal));
    }

    #[test]
    fn test_undo_nothing_returns_none() {
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            vec![make_conflict(1, 1, 5)],
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );
        assert!(session.undo().is_none());
    }

    #[test]
    fn test_redo_nothing_returns_none() {
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            vec![make_conflict(1, 1, 5)],
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );
        assert!(session.redo().is_none());
    }

    #[test]
    fn test_undo_stack_cleared_on_new_action() {
        let conflicts = vec![make_conflict(1, 1, 5)];
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            conflicts,
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );

        // Resolve -> undo -> resolve again
        session.resolve_conflict(1, ConflictStatus::ResolvedWithLocal);
        session.push_undo(UndoEntry {
            description: "first".to_string(),
            statuses: vec![(1, ConflictStatus::Unresolved)],
        });
        session.undo();

        // New action should clear redo stack
        session.resolve_conflict(1, ConflictStatus::ResolvedWithRemote);
        session.push_undo(UndoEntry {
            description: "second".to_string(),
            statuses: vec![(1, ConflictStatus::Unresolved)],
        });

        assert!(session.redo_stack.is_empty());
        assert_eq!(session.undo_stack.len(), 1);
    }

    #[test]
    fn test_undo_multiple_times() {
        let conflicts = vec![
            make_conflict(1, 1, 5),
            make_conflict(2, 10, 14),
        ];
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            conflicts,
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );

        // Resolve both
        let prev1 = session.resolve_conflict(1, ConflictStatus::ResolvedWithLocal).unwrap();
        session.push_undo(UndoEntry {
            description: "Resolve 1".to_string(),
            statuses: vec![(1, prev1)],
        });

        let prev2 = session.resolve_conflict(2, ConflictStatus::ResolvedWithRemote).unwrap();
        session.push_undo(UndoEntry {
            description: "Resolve 2".to_string(),
            statuses: vec![(2, prev2)],
        });

        assert_eq!(session.resolved_count, 2);

        // Undo second
        session.undo();
        assert_eq!(session.resolved_count, 1);
        assert!(matches!(session.conflicts[0].status, ConflictStatus::ResolvedWithLocal));
        assert!(matches!(session.conflicts[1].status, ConflictStatus::Unresolved));

        // Undo first
        session.undo();
        assert_eq!(session.resolved_count, 0);
        assert!(matches!(session.conflicts[0].status, ConflictStatus::Unresolved));
        assert!(matches!(session.conflicts[1].status, ConflictStatus::Unresolved));
    }

    #[test]
    fn test_conflict_mut_nonexistent() {
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            vec![make_conflict(1, 1, 5)],
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );
        assert!(session.conflict_mut(99).is_none());
    }

    #[test]
    fn test_conflict_mut_updates() {
        let mut session = MergeSession::new(
            "file.ts".to_string(),
            vec![make_conflict(1, 1, 5)],
            "local".to_string(),
            "remote".to_string(),
            None,
            String::new(),
        );
        if let Some(c) = session.conflict_mut(1) {
            c.status = ConflictStatus::ResolvedWithBoth;
        }
        assert!(matches!(session.conflicts[0].status, ConflictStatus::ResolvedWithBoth));
    }

    #[test]
    fn test_is_resolved_variants() {
        let block = ConflictBlock::new(1, vec![], None, vec![], 1, 1);
        assert!(!block.is_resolved());

        let mut local = block.clone();
        local.status = ConflictStatus::ResolvedWithLocal;
        assert!(local.is_resolved());

        let mut remote = block.clone();
        remote.status = ConflictStatus::ResolvedWithRemote;
        assert!(remote.is_resolved());

        let mut both = block.clone();
        both.status = ConflictStatus::ResolvedWithBoth;
        assert!(both.is_resolved());

        let mut manual = block.clone();
        manual.status = ConflictStatus::ResolvedManual("custom".to_string());
        assert!(manual.is_resolved());
    }

    #[test]
    fn test_new_session_detects_extension() {
        let cases = vec![
            ("/path/to/file.ts", "ts"),
            ("/path/to/file.jsx", "jsx"),
            ("/path/to/file", ""),
            ("/path/to/.hidden", ""), // .hidden files have None extension in std::path
            ("no_extension", ""),
        ];
        for (path, expected_ext) in cases {
            let session = MergeSession::new(
                path.to_string(),
                vec![],
                "".to_string(),
                "".to_string(),
                None,
                String::new(),
            );
            assert_eq!(session.file_extension, expected_ext, "for path: {}", path);
        }
    }
}
