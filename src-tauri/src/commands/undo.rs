use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Undo the last action for the given file's session.
#[tauri::command]
pub fn undo(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<parser::MergeSession, String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard
        .get_mut(&file_path)
        .ok_or_else(|| format!("Session not found for file: {}", file_path))?;

    session
        .undo()
        .ok_or_else(|| "Nothing to undo".to_string())?;

    Ok(session.clone())
}

/// Redo a previously undone action for the given file's session.
#[tauri::command]
pub fn redo(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<parser::MergeSession, String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard
        .get_mut(&file_path)
        .ok_or_else(|| format!("Session not found for file: {}", file_path))?;

    session
        .redo()
        .ok_or_else(|| "Nothing to redo".to_string())?;

    Ok(session.clone())
}
