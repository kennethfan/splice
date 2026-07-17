use super::conflict::ConflictBlock;

/// Parser state for the conflict marker state machine.
#[derive(Debug, Clone, PartialEq)]
enum ParseState {
    /// Reading normal (non-conflict) lines
    Normal,
    /// Reading local version lines (after <<<<<<<)
    InLocal,
    /// Reading base version lines (after |||||||)
    InBase,
    /// Reading remote version lines (after =======)
    InRemote,
}

/// Line-by-line result from the parser.
#[derive(Debug)]
pub struct ConflictMarkers {
    /// The marker text at the start of the line
    pub marker: String,
    /// Content after the marker (e.g., branch name)
    pub label: String,
}

/// Try to extract a conflict marker from a line.
/// Returns None if the line is not a conflict marker.
pub fn detect_marker(line: &str) -> Option<ConflictMarkers> {
    let trimmed = line.trim_end();

    if trimmed.starts_with("<<<<<<< ") {
        Some(ConflictMarkers {
            marker: "<<<<<<<".to_string(),
            label: trimmed[7..].trim().to_string(),
        })
    } else if trimmed == "<<<<<<<" {
        Some(ConflictMarkers {
            marker: "<<<<<<<".to_string(),
            label: String::new(),
        })
    } else if trimmed.starts_with("||||||| ") {
        Some(ConflictMarkers {
            marker: "|||||||".to_string(),
            label: trimmed[7..].trim().to_string(),
        })
    } else if trimmed == "|||||||" {
        Some(ConflictMarkers {
            marker: "|||||||".to_string(),
            label: String::new(),
        })
    } else if trimmed == "=======" {
        Some(ConflictMarkers {
            marker: "=======".to_string(),
            label: String::new(),
        })
    } else if trimmed.starts_with(">>>>>>> ") {
        Some(ConflictMarkers {
            marker: ">>>>>>>".to_string(),
            label: trimmed[7..].trim().to_string(),
        })
    } else if trimmed == ">>>>>>>" {
        Some(ConflictMarkers {
            marker: ">>>>>>>".to_string(),
            label: String::new(),
        })
    } else {
        None
    }
}

/// Parse content from a single file containing conflict markers.
///
/// Supports both standard format (<<<<<<< / ======= / >>>>>>>)
/// and zdiff3 format (with ||||||| for base).
///
/// Returns a vector of `ConflictBlock` in order of appearance.
pub fn parse_conflicts(content: &str) -> Vec<ConflictBlock> {
    let mut conflicts: Vec<ConflictBlock> = Vec::new();
    let mut state = ParseState::Normal;

    // Accumulators for the current conflict being parsed
    let mut current_local: Vec<String> = Vec::new();
    let mut current_base: Vec<String> = Vec::new();
    let mut current_remote: Vec<String> = Vec::new();
    let mut has_base = false;  // Did we encounter ||||||| in this block?
    let mut current_id: usize = 0;
    let mut current_start_line: usize = 0;
    let mut line_number: usize = 0;

    for line in content.lines() {
        line_number += 1;

        match detect_marker(line) {
            Some(marker_info) => {
                match marker_info.marker.as_str() {
                    "<<<<<<<" => {
                        // Start of a new conflict block
                        if state != ParseState::Normal {
                            // Previous conflict was not closed - emergency close
                            finish_conflict(
                                &mut conflicts,
                                &mut current_local,
                                &mut current_base,
                                &mut current_remote,
                                has_base,
                                current_id,
                                current_start_line,
                                line_number - 1,
                                &mut state,
                            );
                        }
                        // Reset accumulators
                        current_local.clear();
                        current_base.clear();
                        current_remote.clear();
                        has_base = false;
                        current_id += 1;
                        current_start_line = line_number;
                        state = ParseState::InLocal;
                    }
                    "|||||||" => {
                        // Transition to BASE section (zdiff3 format)
                        if state == ParseState::InLocal {
                            has_base = true;
                            state = ParseState::InBase;
                        }
                        // If we see ||||||| outside of InLocal, ignore it
                    }
                    "=======" => {
                        // Transition to REMOTE section
                        if state == ParseState::InLocal {
                            // Standard format: no BASE section
                            state = ParseState::InRemote;
                        } else if state == ParseState::InBase {
                            // zdiff3 format: had BASE section
                            state = ParseState::InRemote;
                        }
                        // If we see ======= outside of conflict, ignore
                    }
                    ">>>>>>>" => {
                        // End of conflict block
                        finish_conflict(
                            &mut conflicts,
                            &mut current_local,
                            &mut current_base,
                            &mut current_remote,
                            has_base,
                            current_id,
                            current_start_line,
                            line_number,
                            &mut state,
                        );
                    }
                    _ => {
                        // Unknown marker - should not happen
                        if state != ParseState::Normal {
                            // Treat as content line
                            collect_line(
                                &mut current_local,
                                &mut current_base,
                                &mut current_remote,
                                has_base,
                                &state,
                                line,
                            );
                        }
                    }
                }
            }
            None => {
                // Regular content line
                match state {
                    ParseState::Normal => {
                        // Not inside a conflict - skip
                    }
                    _ => {
                        collect_line(
                            &mut current_local,
                            &mut current_base,
                            &mut current_remote,
                            has_base,
                            &state,
                            line,
                        );
                    }
                }
            }
        }
    }

    // Handle unclosed conflict at end of file
    if state != ParseState::Normal {
        finish_conflict(
            &mut conflicts,
            &mut current_local,
            &mut current_base,
            &mut current_remote,
            has_base,
            current_id,
            current_start_line,
            line_number,
            &mut state,
        );
    }

    conflicts
}

/// Collect a line into the appropriate accumulator based on current state.
fn collect_line(
    local: &mut Vec<String>,
    base: &mut Vec<String>,
    remote: &mut Vec<String>,
    _has_base: bool,
    state: &ParseState,
    line: &str,
) {
    match state {
        ParseState::InLocal => {
            local.push(line.to_string());
        }
        ParseState::InBase => {
            base.push(line.to_string());
        }
        ParseState::InRemote => {
            remote.push(line.to_string());
        }
        ParseState::Normal => {
            // Should not reach here
        }
    }
}

/// Finalize the current conflict block and add it to the list.
#[allow(clippy::too_many_arguments)]
fn finish_conflict(
    conflicts: &mut Vec<ConflictBlock>,
    local: &mut Vec<String>,
    base: &mut Vec<String>,
    remote: &mut Vec<String>,
    has_base: bool,
    id: usize,
    start_line: usize,
    end_line: usize,
    state: &mut ParseState,
) {
    // Guard: don't create empty conflict blocks
    if local.is_empty() && remote.is_empty() {
        *state = ParseState::Normal;
        return;
    }

    let base_lines = if has_base {
        let lines = std::mem::take(base);
        if lines.is_empty() {
            None
        } else {
            Some(lines)
        }
    } else {
        None
    };

    let block = ConflictBlock::new(
        id,
        std::mem::take(local),
        base_lines,
        std::mem::take(remote),
        start_line,
        end_line,
    );

    conflicts.push(block);
    *state = ParseState::Normal;
}

/// Extract the LOCAL version content from a file with conflict markers.
/// Lines outside conflict blocks are included as-is.
pub fn extract_local_content(content: &str) -> String {
    let mut result = String::new();
    let mut state = ParseState::Normal;
    let mut skip_depth = 0;

    for line in content.lines() {
        match detect_marker(line) {
            Some(marker_info) => {
                match marker_info.marker.as_str() {
                    "<<<<<<<" => {
                        if state == ParseState::Normal {
                            state = ParseState::InLocal;
                        } else {
                            skip_depth += 1;
                        }
                    }
                    "|||||||" | "=======" => {
                        if skip_depth == 0 {
                            state = ParseState::InRemote;
                        }
                    }
                    ">>>>>>>" => {
                        if skip_depth > 0 {
                            skip_depth -= 1;
                        } else {
                            state = ParseState::Normal;
                        }
                    }
                    _ => {}
                }
            }
            None => {
                match state {
                    ParseState::Normal | ParseState::InLocal => {
                        result.push_str(line);
                        result.push('\n');
                    }
                    _ => {}
                }
            }
        }
    }

    result
}

/// Extract the REMOTE version content from a file with conflict markers.
pub fn extract_remote_content(content: &str) -> String {
    let mut result = String::new();
    let mut state = ParseState::Normal;
    let mut in_conflict = false;

    for line in content.lines() {
        match detect_marker(line) {
            Some(marker_info) => {
                match marker_info.marker.as_str() {
                    "<<<<<<<" => {
                        in_conflict = true;
                        state = ParseState::InLocal;
                    }
                    "|||||||" => {
                        state = ParseState::InBase;
                    }
                    "=======" => {
                        state = ParseState::InRemote;
                    }
                    ">>>>>>>" => {
                        in_conflict = false;
                        state = ParseState::Normal;
                    }
                    _ => {}
                }
            }
            None => {
                if !in_conflict {
                    // Normal line outside conflicts - include in both versions
                    result.push_str(line);
                    result.push('\n');
                } else if matches!(state, ParseState::InRemote) {
                    result.push_str(line);
                    result.push('\n');
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Basic parsing ──

    #[test]
    fn test_no_conflicts() {
        let content = "line1\nline2\nline3\n";
        let conflicts = parse_conflicts(content);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_single_conflict_standard() {
        let content = "line1\n<<<<<<< HEAD\nlocal change\n=======\nremote change\n>>>>>>> branch\nline2\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        let block = &conflicts[0];
        assert_eq!(block.id, 1);
        assert_eq!(block.local_lines, vec!["local change"]);
        assert!(block.base_lines.is_none());
        assert_eq!(block.remote_lines, vec!["remote change"]);
    }

    #[test]
    fn test_single_conflict_zdiff3() {
        let content = "a\n<<<<<<< HEAD\nlocal\n||||||| parent of abc\nbase\n=======\nremote\n>>>>>>> branch\nb\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        let block = &conflicts[0];
        assert_eq!(block.local_lines, vec!["local"]);
        assert_eq!(block.base_lines, Some(vec!["base".to_string()]));
        assert_eq!(block.remote_lines, vec!["remote"]);
    }

    #[test]
    fn test_multiple_conflicts() {
        let content = "a\n<<<<<<< HEAD\nL1\n=======\nR1\n>>>>>>> b1\nmiddle\n<<<<<<< HEAD\nL2\n=======\nR2\n>>>>>>> b2\nc\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 2);
        assert_eq!(conflicts[0].id, 1);
        assert_eq!(conflicts[0].local_lines, vec!["L1"]);
        assert_eq!(conflicts[1].id, 2);
        assert_eq!(conflicts[1].local_lines, vec!["L2"]);
    }

    #[test]
    fn test_multi_line_conflict() {
        let content = "<<<<<<< HEAD\nline1\nline2\n=======\nline3\nline4\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["line1", "line2"]);
        assert_eq!(conflicts[0].remote_lines, vec!["line3", "line4"]);
    }

    #[test]
    fn test_empty_local() {
        let content = "<<<<<<< HEAD\n=======\nremote\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert!(conflicts[0].local_lines.is_empty());
        assert_eq!(conflicts[0].remote_lines, vec!["remote"]);
    }

    #[test]
    fn test_empty_remote() {
        let content = "<<<<<<< HEAD\nlocal\n=======\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["local"]);
        assert!(conflicts[0].remote_lines.is_empty());
    }

    #[test]
    fn test_unclosed_conflict() {
        let content = "<<<<<<< HEAD\nlocal\n=======\nremote\n";
        let conflicts = parse_conflicts(content);
        // Should still produce a conflict block even without >>>>>>>
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["local"]);
        assert_eq!(conflicts[0].remote_lines, vec!["remote"]);
    }

    #[test]
    fn test_extract_local_content() {
        let content = "normal\n<<<<<<< HEAD\nlocal change\n=======\nremote change\n>>>>>>> branch\nnormal2\n";
        let local = extract_local_content(content);
        assert_eq!(local, "normal\nlocal change\nnormal2\n");
    }

    #[test]
    fn test_extract_remote_content() {
        let content = "normal\n<<<<<<< HEAD\nlocal change\n=======\nremote change\n>>>>>>> branch\nnormal2\n";
        let remote = extract_remote_content(content);
        assert_eq!(remote, "normal\nremote change\nnormal2\n");
    }

    #[test]
    fn test_marker_with_labels() {
        let content = "<<<<<<< HEAD:index.js\nlocal\n=======\nremote\n>>>>>>> feature/login:index.js\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
    }

    #[test]
    fn test_no_whitespace_markers() {
        let content = "<<<<<<<HEAD\nlocal\n=======\nremote\n>>>>>>>branch\n";
        let conflicts = parse_conflicts(content);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_many_conflicts() {
        let mut content = String::new();
        for i in 0..100 {
            content.push_str(&format!("<<<<<<< HEAD\nlocal_{}\n=======\nremote_{}\n>>>>>>> branch\n", i, i));
        }
        let conflicts = parse_conflicts(&content);
        assert_eq!(conflicts.len(), 100);
        assert_eq!(conflicts[0].local_lines, vec!["local_0"]);
        assert_eq!(conflicts[99].local_lines, vec!["local_99"]);
    }

    #[test]
    fn test_conflict_with_special_characters() {
        let content = "<<<<<<< HEAD\nfn foo(x: i32) -> String {\n    x.to_string()\n}\n=======\nfn bar() {\n    println!(\"hello\");\n}\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines.len(), 3);
        assert_eq!(conflicts[0].remote_lines.len(), 3);
    }

    #[test]
    fn test_content_around_conflicts_preserved() {
        let content = "before\n<<<<<<< HEAD\nlocal\n=======\nremote\n>>>>>>> branch\nafter\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        let local_full = extract_local_content(content);
        let remote_full = extract_remote_content(content);
        assert!(local_full.starts_with("before\n"));
        assert!(local_full.ends_with("after\n"));
        assert!(remote_full.starts_with("before\n"));
        assert!(remote_full.ends_with("after\n"));
    }

    // ── Edge cases ──

    #[test]
    fn test_empty_file() {
        let conflicts = parse_conflicts("");
        assert!(conflicts.is_empty());

        let local = extract_local_content("");
        assert_eq!(local, "");

        let remote = extract_remote_content("");
        assert_eq!(remote, "");
    }

    #[test]
    fn test_only_conflict_markers_no_content() {
        // This should not create a conflict block since local and remote are both empty
        let content = "<<<<<<< HEAD\n=======\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_consecutive_conflicts_no_gap() {
        // Two conflicts right next to each other with no normal lines in between
        let content = "<<<<<<< HEAD\nlocal1\n=======\nremote1\n>>>>>>> branch\n<<<<<<< HEAD\nlocal2\n=======\nremote2\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 2);
        assert_eq!(conflicts[0].id, 1);
        assert_eq!(conflicts[1].id, 2);
        assert_eq!(conflicts[0].local_lines, vec!["local1"]);
        assert_eq!(conflicts[1].local_lines, vec!["local2"]);
        // The first block ends at line 5, second starts at line 6
        assert_eq!(conflicts[0].end_line, 5);
        assert_eq!(conflicts[1].start_line, 6);
    }

    #[test]
    fn test_mixed_zdiff3_and_standard() {
        // First block with zdiff3, second without
        let content = "<<<<<<< HEAD\nlocal\n||||||| base\nbase_content\n=======\nremote\n>>>>>>> branch\nnormal\n<<<<<<< HEAD\nlocal2\n=======\nremote2\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 2);
        // First block has base
        assert!(conflicts[0].base_lines.is_some());
        assert_eq!(conflicts[0].local_lines, vec!["local"]);
        assert_eq!(conflicts[0].base_lines.clone().unwrap(), vec!["base_content"]);
        assert_eq!(conflicts[0].remote_lines, vec!["remote"]);
        // Second block (standard) has no base
        assert!(conflicts[1].base_lines.is_none());
        assert_eq!(conflicts[1].local_lines, vec!["local2"]);
        assert_eq!(conflicts[1].remote_lines, vec!["remote2"]);
    }

    #[test]
    fn test_unicode_and_emoji_in_conflicts() {
        let content = "<<<<<<< HEAD\nconst greeting = \"你好，世界！\";\nconst emoji = \"🚀🌍\";\n=======\nconst greeting = \"Hello, 🌍!\";\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines[0], "const greeting = \"你好，世界！\";");
        assert_eq!(conflicts[0].local_lines[1], "const emoji = \"🚀🌍\";");
        assert_eq!(conflicts[0].remote_lines[0], "const greeting = \"Hello, 🌍!\";");
    }

    #[test]
    fn test_whitespace_only_lines_in_conflict() {
        let content = "<<<<<<< HEAD\n  \n\t\n=======\n    \n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["  ", "\t"]);
        assert_eq!(conflicts[0].remote_lines, vec!["    "]);
    }

    #[test]
    fn test_marker_like_content_lines() {
        // Lines that LOOK like markers but aren't (no trailing space for <<<, >>>, |||)
        let content = "<<<<<<< HEAD\nconst x = 1; // ======= is not a marker here\nconst y = 2; // >>>>>>> is not a marker here either\n=======\nconst x = 2;\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines.len(), 2);
        assert_eq!(conflicts[0].remote_lines.len(), 1);
        // Local lines contain the "=======" and ">>>>>>>" as plain text because
        // they are not at the start of the line or don't match the marker pattern
        assert_eq!(conflicts[0].local_lines[0], "const x = 1; // ======= is not a marker here");
        assert_eq!(conflicts[0].local_lines[1], "const y = 2; // >>>>>>> is not a marker here either");
    }

    #[test]
    fn test_trailing_whitespace_on_markers() {
        // Git adds "/n" at the end of markers; our parser trims_end
        let content = "<<<<<<< HEAD\nlocal\n=======\nremote\n>>>>>>> branch  \n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["local"]);
        assert_eq!(conflicts[0].remote_lines, vec!["remote"]);
    }

    #[test]
    fn test_line_numbers_correct() {
        let content = "line0\n<<<<<<< HEAD\nlocal\n=======\nremote\n>>>>>>> branch\nline6\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        // <<<<<<< is line 2, >>>>>>> is line 6
        assert_eq!(conflicts[0].start_line, 2);
        assert_eq!(conflicts[0].end_line, 6);
    }

    #[test]
    fn test_extract_local_with_mixed_formats() {
        let content = "<<<<<<< HEAD\nlocal1\n||||||| base\nbase1\n=======\nremote1\n>>>>>>> branch\nnormal\n<<<<<<< HEAD\nlocal2\n=======\nremote2\n>>>>>>> branch\n";
        let local = extract_local_content(content);
        assert!(local.contains("local1"));
        assert!(local.contains("local2"));
        assert!(local.contains("normal"));
        assert!(!local.contains("base1"));
        assert!(!local.contains("remote1"));
    }

    #[test]
    fn test_extract_remote_same_as_local_unchanged_parts() {
        let content = "shared_code\n<<<<<<< HEAD\nlocal_change\n=======\nremote_change\n>>>>>>> branch\nshared_again\n";
        let local = extract_local_content(content);
        let remote = extract_remote_content(content);
        // Both should contain the shared parts
        assert!(local.starts_with("shared_code\n"));
        assert!(remote.starts_with("shared_code\n"));
        assert!(local.ends_with("shared_again\n"));
        assert!(remote.ends_with("shared_again\n"));
        // But different within the conflict
        assert!(local.contains("local_change"));
        assert!(remote.contains("remote_change"));
    }

    #[test]
    fn test_unclosed_conflict_at_start_of_file() {
        let content = "<<<<<<< HEAD\nlocal\n=======\nremote\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["local"]);
        assert_eq!(conflicts[0].remote_lines, vec!["remote"]);
    }

    #[test]
    fn test_only_normal_lines_no_markers() {
        let content = "fn hello() {\n    println!(\"hi\");\n}\n";
        let conflicts = parse_conflicts(content);
        assert!(conflicts.is_empty());

        let local = extract_local_content(content);
        assert_eq!(local, content);

        let remote = extract_remote_content(content);
        assert_eq!(remote, content);
    }

    #[test]
    fn test_just_markers_with_empty_lines_between() {
        let content = "<<<<<<< HEAD\n\n\n=======\n\n\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].local_lines, vec!["", ""]);
        assert_eq!(conflicts[0].remote_lines, vec!["", ""]);
    }

    #[test]
    fn test_sequential_unclosed_conflicts_triggers_emergency_close() {
        // Two conflicts started without closing the first
        let content = "<<<<<<< HEAD\nlocal1\n=======\nremote1\n<<<<<<< HEAD\nlocal2\n=======\nremote2\n>>>>>>> branch\n";
        let conflicts = parse_conflicts(content);
        assert_eq!(conflicts.len(), 2);
        assert_eq!(conflicts[0].id, 1);
        assert_eq!(conflicts[1].id, 2);
        // First conflict should be emergency-closed before <<<<<<< on line 5
        assert_eq!(conflicts[0].local_lines, vec!["local1"]);
    }

    #[test]
    fn test_truly_nested_conflicts() {
        // True nesting: a <<<<<<< appears inside another conflict's content
        // before the outer >>>>>>>. This can happen in rebase/octopus merges.
        // The parser should emergency-close the outer conflict and treat
        // the inner one as a separate conflict.
        let content = concat!(
            "<<<<<<< HEAD\n",
            "outer_local\n",
            "<<<<<<< HEAD\n",
            "inner_local\n",
            "=======\n",
            "inner_remote\n",
            ">>>>>>> inner\n",
            "=======\n",
            "outer_remote\n",
            ">>>>>>> outer\n",
        );
        let conflicts = parse_conflicts(content);
        // Should produce 2 conflicts: the outer (emergency-closed) and the inner
        assert_eq!(conflicts.len(), 2, "Nested markers should produce 2 separate conflicts");

        // First conflict: outer emergency-closed at line 3 (when inner <<<<<<< is encountered).
        // Since the outer never reached its =======, remote_lines is empty.
        assert_eq!(conflicts[0].id, 1);
        assert_eq!(conflicts[0].local_lines, vec!["outer_local"]);
        assert!(conflicts[0].remote_lines.is_empty(),
            "Outer emergency-closed before =======, so remote should be empty");

        // Second conflict: the inner one (fully closed)
        assert_eq!(conflicts[1].id, 2);
        assert_eq!(conflicts[1].local_lines, vec!["inner_local"]);
        assert_eq!(conflicts[1].remote_lines, vec!["inner_remote"]);
        assert!(conflicts[1].base_lines.is_none());
    }
}
