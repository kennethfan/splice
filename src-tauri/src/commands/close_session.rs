use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Close a session and remove it from the app state.
#[tauri::command]
pub fn close_session(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
    guard.remove(&file_path);
    Ok(())
}
