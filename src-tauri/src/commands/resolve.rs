use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Action to take when resolving a conflict.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub enum ResolveAction {
    Local,
    Remote,
    Both,
    Manual(String),
}

/// Resolve a single conflict block by ID.
#[tauri::command]
pub fn resolve_conflict(
    file_path: String,
    conflict_id: usize,
    action: ResolveAction,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<parser::MergeSession, String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard
        .get_mut(&file_path)
        .ok_or_else(|| format!("Session not found for file: {}", file_path))?;

    // Convert the action to a ConflictStatus and determine the label
    let (new_status, action_label) = match action {
        ResolveAction::Local => (parser::ConflictStatus::ResolvedWithLocal, "Local"),
        ResolveAction::Remote => (parser::ConflictStatus::ResolvedWithRemote, "Remote"),
        ResolveAction::Both => (parser::ConflictStatus::ResolvedWithBoth, "Both"),
        ResolveAction::Manual(content) => {
            (parser::ConflictStatus::ResolvedManual(content), "Manual")
        }
    };

    // Capture previous status for undo before resolving
    let prev_status = session
        .resolve_conflict(conflict_id, new_status)
        .ok_or_else(|| format!("Conflict {} not found", conflict_id))?;

    // Push undo entry
    session.push_undo(parser::UndoEntry {
        description: format!("Resolve conflict {} with {}", conflict_id, action_label),
        statuses: vec![(conflict_id, prev_status)],
    });

    Ok(session.clone())
}
