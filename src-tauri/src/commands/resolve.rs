use std::sync::Mutex;

use crate::parser;

/// Action to take when resolving a conflict.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolveAction {
    Local,
    Remote,
    Both,
    Manual(String),
}

/// Resolve a single conflict block by ID.
#[tauri::command]
pub fn resolve_conflict(
    _session_id: usize,
    conflict_id: usize,
    action: ResolveAction,
    state: tauri::State<'_, Mutex<Option<parser::MergeSession>>>,
) -> Result<parser::MergeSession, String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard.as_mut().ok_or("No active session")?;

    // Verify session_id matches
    // (For MVP we only support one session, so we just check it exists)

    // Convert the action to a ConflictStatus
    let new_status = match action {
        ResolveAction::Local => parser::ConflictStatus::ResolvedWithLocal,
        ResolveAction::Remote => parser::ConflictStatus::ResolvedWithRemote,
        ResolveAction::Both => parser::ConflictStatus::ResolvedWithBoth,
        ResolveAction::Manual(content) => parser::ConflictStatus::ResolvedManual(content),
    };

    // Resolve the conflict
    session
        .resolve_conflict(conflict_id, new_status)
        .ok_or_else(|| format!("Conflict {} not found", conflict_id))?;

    Ok(session.clone())
}
