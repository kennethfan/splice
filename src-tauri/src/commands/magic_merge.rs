use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Automatically resolve all non-conflicting changes.
/// Returns the full updated MergeSession so the frontend can use it directly.
#[tauri::command]
pub fn magic_merge(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<parser::MergeSession, String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard
        .get_mut(&file_path)
        .ok_or_else(|| format!("Session not found for file: {}", file_path))?;

    let mut auto_resolved = 0usize;
    let mut _remaining = 0usize;

    // Collect conflict IDs and their current statuses (for undo)
    let mut undo_statuses: Vec<(usize, parser::ConflictStatus)> = Vec::new();
    let mut conflict_ids: Vec<usize> = Vec::new();

    for conflict in &session.conflicts {
        if !conflict.is_resolved() {
            undo_statuses.push((conflict.id, conflict.status.clone()));
            conflict_ids.push(conflict.id);
        }
    }

    for id in &conflict_ids {
        let conflict = session
            .conflict_mut(*id)
            .ok_or_else(|| format!("Conflict {} disappeared", id))?;

        // Determine if this can be auto-resolved
        let can_auto_resolve = match (&conflict.base_lines, &conflict.local_lines, &conflict.remote_lines) {
            (Some(base), local, remote) if local != base && remote == base => {
                conflict.status = parser::ConflictStatus::ResolvedWithLocal;
                true
            }
            (Some(base), local, remote) if local == base && remote != base => {
                conflict.status = parser::ConflictStatus::ResolvedWithRemote;
                true
            }
            _ => false,
        };

        if can_auto_resolve {
            auto_resolved += 1;
        }
    }

    // Only push undo if something actually changed
    if auto_resolved > 0 {
        session.push_undo(parser::UndoEntry {
            description: format!("Magic merge ({} auto-resolved)", auto_resolved),
            statuses: undo_statuses,
        });
    }

    // Update counts after all changes
    session.recount();

    Ok(session.clone())
}
