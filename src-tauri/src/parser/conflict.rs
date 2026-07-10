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
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    /// Number of resolved conflicts
    pub resolved_count: usize,
    /// Total number of conflicts
    pub total_count: usize,
    /// Whether the file has been saved after the last change
    pub saved: bool,
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
    ///
    /// `start_line` is the 1-based line number of the `<<<<<<<` marker.
    /// `end_line` is the 1-based line number of the `>>>>>>>` marker (or EOF).
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
    pub fn new(
        file_path: String,
        conflicts: Vec<ConflictBlock>,
        all_local_content: String,
        all_remote_content: String,
        all_base_content: Option<String>,
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
            resolved_count: 0,
            total_count,
            saved: false,
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
    /// Used internally when multiple conflicts need bulk updates (e.g., Magic Merge).
    pub fn conflict_mut(&mut self, conflict_id: usize) -> Option<&mut ConflictBlock> {
        self.conflicts.iter_mut().find(|c| c.id == conflict_id)
    }
}
