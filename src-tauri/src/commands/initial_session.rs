use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Get the path of a pre-loaded session from mergetool mode.
/// In mergetool mode, the Rust backend reads the result file and creates
/// a MergeSession before the frontend even loads. This command lets the
/// frontend discover that session and create a tab for it.
#[tauri::command]
pub fn get_initial_session(
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<Option<parser::MergeSession>, String> {
    let guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    // Return the first session (there should be exactly one in mergetool mode)
    let session = guard.values().next().cloned();
    Ok(session)
}
