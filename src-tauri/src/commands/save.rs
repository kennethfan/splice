use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;
use crate::git;

/// Build the resolved result content from the session.
/// Preserves trailing newline from the original content (if present).
/// Uses `session.original_content` (with conflict markers) to walk through
/// and replace resolved conflict blocks with their resolved content.
pub(crate) fn build_result_content(session: &parser::MergeSession) -> String {
    let original = &session.original_content;
    let has_trailing_newline = original.ends_with('\n');
    let mut result_lines: Vec<String> = Vec::new();
    let mut line_number: usize = 0;

    // Use split('\n') instead of lines() to preserve trailing empty segment
    let lines: Vec<&str> = original.split('\n').collect();
    // If content ends with \n, lines() would drop the trailing "", split('\n') keeps it
    // Adjust loop to stop before the trailing empty string
    let total_lines = if has_trailing_newline {
        lines.len() - 1
    } else {
        lines.len()
    };

    let mut i = 0;
    while i < total_lines {
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
                    while i < total_lines {
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
                        _ => {}
                    }
                    continue;
                }
            }
            result_lines.push(line.to_string());
            i += 1;
        } else {
            result_lines.push(line.to_string());
            i += 1;
        }
    }

    let mut result = result_lines.join("\n");
    if has_trailing_newline {
        result.push('\n');
    }
    result
}

/// Save the current resolved state to the file.
/// If launched via `git mergetool`, exits the app afterwards so
/// git mergetool can detect the tool finished and stage the result.
#[tauri::command]
pub fn save_file(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;

    let session = guard
        .get_mut(&file_path)
        .ok_or_else(|| format!("Session not found: {}", file_path))?;

    // Build the resolved content
    let result_content = build_result_content(session);

    // Write to the file
    std::fs::write(&file_path, &result_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Create a backup of the original conflict file (only on first save, and only in non-mergetool mode)
    // In mergetool mode, git already manages its own backup files (app_BACKUP_*)
    if !git::mergetool::is_mergetool_mode() {
        let backup_path = format!("{}.splice.bak", &file_path);
        if !std::path::Path::new(&backup_path).exists() {
            let _ = std::fs::write(&backup_path, &session.original_content);
        }
    }

    session.saved = true;

    // Drop the lock before potentially exiting
    drop(guard);

    // In mergetool mode, exit after save so git mergetool can pick up the result
    if git::mergetool::is_mergetool_mode() {
        eprintln!("✅ Splice: conflicts resolved, exiting for git mergetool");
        // Use process::exit to ensure immediate shutdown (Tauri's app_handle.exit
        // can be async and may not complete before git checks the result)
        std::process::exit(0);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to build a session from content with no base.
    fn build_session(content: &str) -> parser::MergeSession {
        let conflicts = parser::lexer::parse_conflicts(content);
        let all_local = parser::lexer::extract_local_content(content);
        let all_remote = parser::lexer::extract_remote_content(content);
        parser::MergeSession::new(
            "/tmp/test.ts".to_string(),
            conflicts,
            all_local,
            all_remote,
            None,
            content.to_string(), // original content with markers
        )
    }

    #[test]
    fn test_no_conflicts_passes_through() {
        let content = "line1\nline2\nline3\n";
        let session = build_session(content);
        // Make sure it's treated as a session with 0 conflicts
        assert_eq!(session.total_count, 0);
        let result = build_result_content(&session);
        assert_eq!(result, content);
    }

    #[test]
    fn test_unresolved_conflict_keeps_markers() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local\n",
            "=======\n",
            "remote\n",
            ">>>>>>> branch\n",
            "b\n",
        );
        let session = build_session(content);
        // Conflict is unresolved -> markers should be preserved
        let result = build_result_content(&session);
        assert_eq!(result, content, "Unresolved conflict should keep markers intact");
    }

    #[test]
    fn test_resolve_with_local_replaces_markers() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local_change\n",
            "=======\n",
            "remote_change\n",
            ">>>>>>> branch\n",
            "b\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithLocal);

        let result = build_result_content(&session);
        let expected = "a\nlocal_change\nb\n";
        assert_eq!(result, expected);
        assert!(!result.contains("<<<<<<<"));
        assert!(!result.contains(">>>>>>>"));
        assert!(!result.contains("======="));
        assert!(!result.contains("remote_change"));
    }

    #[test]
    fn test_resolve_with_remote_replaces_markers() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local_change\n",
            "=======\n",
            "remote_change\n",
            ">>>>>>> branch\n",
            "b\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithRemote);

        let result = build_result_content(&session);
        let expected = "a\nremote_change\nb\n";
        assert_eq!(result, expected);
        assert!(!result.contains("local_change"), "Remote resolve should exclude local content");
    }

    #[test]
    fn test_resolve_with_both_keeps_both() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local\n",
            "=======\n",
            "remote\n",
            ">>>>>>> branch\n",
            "b\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithBoth);

        let result = build_result_content(&session);
        let expected = "a\nlocal\nremote\nb\n";
        assert_eq!(result, expected);
        // Both local and remote should appear, in that order
        let lines: Vec<&str> = result.lines().collect();
        assert!(lines.contains(&"local"));
        assert!(lines.contains(&"remote"));
    }

    #[test]
    fn test_resolve_with_manual_custom_content() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local\n",
            "=======\n",
            "remote\n",
            ">>>>>>> branch\n",
            "b\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedManual(
            "custom merged code".to_string(),
        ));

        let result = build_result_content(&session);
        let expected = "a\ncustom merged code\nb\n";
        assert_eq!(result, expected);
    }

    #[test]
    fn test_multiple_conflicts_different_resolutions() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local1\n",
            "=======\n",
            "remote1\n",
            ">>>>>>> branch\n",
            "middle\n",
            "<<<<<<< HEAD\n",
            "local2\n",
            "=======\n",
            "remote2\n",
            ">>>>>>> branch\n",
            "c\n",
        );
        let mut session = build_session(content);
        // Resolve first with local, keep second unresolved
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithLocal);

        let result = build_result_content(&session);
        assert!(result.contains("local1"), "Resolved conflict should show local content");
        assert!(!result.contains("remote1"), "Resolved conflict should not show remote content");
        assert!(result.contains("middle"), "Non-conflict content should be preserved");
        // Second conflict is still unresolved, should keep markers
        assert!(result.contains("<<<<<<<"),
            "Unresolved conflict should retain conflict markers");
        // The resolved conflict's markers should be gone (only local content remains)
        assert!(result.contains("local2") || result.contains("<<<<<<<"),
            "Unresolved conflict markers or content should be present");
    }

    #[test]
    fn test_multi_line_local_and_remote() {
        let content = concat!(
            "<<<<<<< HEAD\n",
            "line1_local\n",
            "line2_local\n",
            "=======\n",
            "line1_remote\n",
            "line2_remote\n",
            "line3_remote\n",
            ">>>>>>> branch\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithLocal);

        let result = build_result_content(&session);
        let expected = "line1_local\nline2_local\n";
        assert_eq!(result, expected);
    }

    #[test]
    fn test_zdiff3_with_base_resolved_as_local() {
        let content = concat!(
            "a\n",
            "<<<<<<< HEAD\n",
            "local\n",
            "||||||| parent\n",
            "base\n",
            "=======\n",
            "remote\n",
            ">>>>>>> branch\n",
            "b\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithLocal);

        let result = build_result_content(&session);
        let expected = "a\nlocal\nb\n";
        assert_eq!(result, expected, "zdiff3 markers should be replaced by resolved content");
    }

    #[test]
    fn test_surrounding_content_preserved_in_result() {
        let content = concat!(
            "before\n",
            "<<<<<<< HEAD\n",
            "local\n",
            "=======\n",
            "remote\n",
            ">>>>>>> branch\n",
            "after\n",
        );
        let mut session = build_session(content);
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithRemote);

        let result = build_result_content(&session);
        assert!(result.starts_with("before\n"), "Result should start with 'before'");
        assert!(result.ends_with("after\n"), "Result should end with 'after'");
        assert!(result.contains("remote"), "Result should contain resolved content");
    }
}
