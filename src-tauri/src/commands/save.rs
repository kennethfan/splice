use std::sync::Mutex;

use crate::parser;

/// Build the resolved result content from the session.
///
/// Strategy: scan the original file content line by line.
/// When we find a conflict marker region (<<<<<<< ... >>>>>>>) that
/// corresponds to a resolved conflict block, replace it with the
/// resolved content. Unresolved conflicts are left as-is.
fn build_result_content(session: &parser::MergeSession) -> String {
    // Read the original file content that was parsed
    let original = &session.all_local_content;
    let mut result_lines: Vec<String> = Vec::new();
    let mut line_number: usize = 0;

    let lines: Vec<&str> = original.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        line_number += 1;
        let line = lines[i];

        // Check if this line is a conflict start marker
        if parser::lexer::detect_marker(line).map_or(false, |m| m.marker == "<<<<<<<") {
            // Find which conflict block this corresponds to
            if let Some(conflict) = session.conflicts.iter().find(|c| c.start_line == line_number) {
                if conflict.is_resolved() {
                    // Skip the entire conflict block (<<<<<<< ... >>>>>>>)
                    i += 1;
                    line_number += 1;
                    while i < lines.len() {
                        let is_end = parser::lexer::detect_marker(lines[i])
                            .map_or(false, |m| m.marker == ">>>>>>>");
                        i += 1;
                        line_number += 1;
                        if is_end {
                            break;
                        }
                    }

                    // Add the resolved content instead
                    match &conflict.status {
                        parser::ConflictStatus::ResolvedWithLocal => {
                            // Keep LOCAL lines
                            for l in &conflict.local_lines {
                                result_lines.push(l.clone());
                            }
                        }
                        parser::ConflictStatus::ResolvedWithRemote => {
                            for l in &conflict.remote_lines {
                                result_lines.push(l.clone());
                            }
                        }
                        parser::ConflictStatus::ResolvedWithBoth => {
                            for l in &conflict.local_lines {
                                result_lines.push(l.clone());
                            }
                            for l in &conflict.remote_lines {
                                result_lines.push(l.clone());
                            }
                        }
                        parser::ConflictStatus::ResolvedManual(content) => {
                            result_lines.push(content.clone());
                        }
                        _ => {} // Unresolved handled below
                    }
                    continue;
                }
            }
            // If not resolved or not found, keep the original line
            result_lines.push(line.to_string());
            i += 1;
        } else {
            // Regular line (not a conflict marker)
            result_lines.push(line.to_string());
            i += 1;
        }
    }

    result_lines.join("\n")
}

/// Save the current resolved state to the file.
#[tauri::command]
pub fn save_file(
    state: tauri::State<'_, Mutex<Option<parser::MergeSession>>>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard.as_mut().ok_or("No active session")?;

    // Build the resolved content
    let result_content = build_result_content(session);

    // Write to the file
    std::fs::write(&session.file_path, &result_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Create a backup of the original conflict file (only on first save)
    let backup_path = format!("{}.splice.bak", &session.file_path);
    if !std::path::Path::new(&backup_path).exists() {
        let original = session.all_local_content.clone();
        let _ = std::fs::write(&backup_path, &original);
    }

    session.saved = true;

    Ok(())
}
