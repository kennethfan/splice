use std::collections::HashMap;
use std::sync::Mutex;

use crate::diff;
use crate::parser;

/// Compute line-level and word-level diffs for all conflicts in a session.
#[tauri::command]
pub fn compute_diffs(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<Vec<diff::BlockDiff>, String> {
    let guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard
        .get(&file_path)
        .ok_or_else(|| format!("Session not found for file: {}", file_path))?;

    let diffs = diff::compute_session_diffs(&session.conflicts);
    Ok(diffs)
}
