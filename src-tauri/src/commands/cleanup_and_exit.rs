use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Force-exit the app, bypassing the window close event.
/// Called by the frontend after the user confirms they want to quit
/// (even if there are unsaved changes or unresolved conflicts).
#[tauri::command]
pub fn cleanup_and_exit(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<(), String> {
    // Clear all sessions from state
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
    guard.clear();
    drop(guard);

    // Exit the application (bypasses window close event entirely)
    app_handle.exit(0);
    Ok(())
}
