use std::sync::Mutex;

use crate::parser;

/// Automatically resolve all non-conflicting changes.
/// Only lines where both LOCAL and REMOTE changed remain unresolved.
#[tauri::command]
pub fn magic_merge(
    _session_id: usize,
    state: tauri::State<'_, Mutex<Option<parser::MergeSession>>>,
) -> Result<parser::MagicMergeResult, String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard.as_mut().ok_or("No active session")?;

    let mut auto_resolved = 0usize;
    let mut remaining = 0usize;

    // Collect conflict IDs to modify (can't mutate while iterating)
    let conflict_ids: Vec<usize> = session
        .conflicts
        .iter()
        .filter(|c| !c.is_resolved())
        .map(|c| c.id)
        .collect();

    for id in conflict_ids {
        let conflict = session
            .conflict_mut(id)
            .ok_or_else(|| format!("Conflict {} disappeared", id))?;

        // Determine if this can be auto-resolved
        let can_auto_resolve = match (&conflict.base_lines, &conflict.local_lines, &conflict.remote_lines) {
            // Has BASE, and only one side changed
            (Some(base), local, remote) if local != base && remote == base => {
                conflict.status = parser::ConflictStatus::ResolvedWithLocal;
                true
            }
            (Some(base), local, remote) if local == base && remote != base => {
                conflict.status = parser::ConflictStatus::ResolvedWithRemote;
                true
            }
            // Both sides changed, or no BASE available - needs manual resolution
            _ => false,
        };

        if can_auto_resolve {
            auto_resolved += 1;
        } else {
            remaining += 1;
        }
    }

    // Update counts after all changes
    session.recount();

    Ok(parser::MagicMergeResult {
        auto_resolved,
        remaining,
    })
}
