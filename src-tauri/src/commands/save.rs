use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;
use crate::git;

/// Walk up from a file path to find the git repository root.
/// Returns the directory containing `.git` (file or directory).
fn find_repo_root(file_path: &str) -> Result<std::path::PathBuf, String> {
    let canonical = std::fs::canonicalize(file_path)
        .map_err(|e| format!("Cannot canonicalize path: {}", e))?;

    let mut dir = canonical
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?
        .to_path_buf();

    loop {
        if dir.join(".git").exists() {
            return Ok(dir);
        }
        // Try parent — if we can't pop (already at root), repo not found
        if !dir.pop() {
            return Err(format!(
                "Not a git repository: no .git found in any parent of '{}'",
                file_path
            ));
        }
    }
}

/// Stage the resolved file in the git index to mark the conflict as resolved.
/// Uses the git2 library directly instead of shelling out to `git add`,
/// which avoids PATH and working-directory issues when running as a bundled app.
///
/// Instead of relying on git2's `Repository::open` to walk up from the file's
/// parent directory (which can fail with deep Java/maven directory hierarchies,
/// submodules, or symlinked paths), we first discover the repo root by manually
/// walking up looking for `.git`, then open the repo from the root explicitly.
fn stage_in_git(file_path: &str) -> Result<(), String> {
    let canonical = std::fs::canonicalize(file_path)
        .map_err(|e| format!("Cannot canonicalize path: {}", e))?;

    // Find repo root by walking up — more robust than git2's auto-discovery
    let repo_root = find_repo_root(file_path)?;

    let repo = git2::Repository::open(&repo_root)
        .map_err(|e| format!("Cannot open git repo at {:?}: {}", repo_root, e))?;

    let workdir = repo.workdir().ok_or_else(|| "Repo has no working tree".to_string())?;
    let relative = pathdiff::diff_paths(&canonical, workdir)
        .ok_or_else(|| "Cannot compute relative path".to_string())?;

    let mut index = repo.index().map_err(|e| format!("Cannot open index: {}", e))?;
    index
        .add_path(&relative)
        .map_err(|e| format!("Cannot stage file via git2: {}", e))?;
    index
        .write()
        .map_err(|e| format!("Cannot write index via git2: {}", e))?;
    Ok(())
}

/// Fallback: stage file using `git add` via CLI.
/// Used when git2 staging fails for any reason.
/// Uses `-C <parent>` to ensure git looks for `.git` from the correct directory,
/// avoiding issues with the bundled app's unpredictable working directory.
fn stage_in_git_cli(file_path: &str) -> Result<(), String> {
    // Determine parent directory for -C flag so git can find the repo
    let parent = std::path::Path::new(file_path)
        .parent()
        .and_then(|p| p.to_str())
        .unwrap_or(".");

    let output = std::process::Command::new("git")
        .args(["-C", parent, "add", file_path])
        .output()
        .map_err(|e| format!("Cannot run git add: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("git add failed: {}", stderr.trim()))
    }
}

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
        if parser::lexer::detect_marker(line).is_some_and(|m| m.marker == "<<<<<<<") {
            // Find which conflict block this corresponds to
            if let Some(conflict) = session.conflicts.iter().find(|c| c.start_line == line_number) {
                if conflict.is_resolved() {
                    // Skip the entire conflict block (<<<<<<< ... >>>>>>>)
                    i += 1;
                    line_number += 1;
                    while i < total_lines {
                        let line = lines[i];
                        let is_end = parser::lexer::detect_marker(line)
                            .is_some_and(|m| m.marker == ">>>>>>>");
                        if is_end {
                            // Advance i past the end marker. Don't increment
                            // line_number — the outer loop will do that.
                            i += 1;
                            break;
                        }
                        i += 1;
                        line_number += 1;
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

    // Create a temporary backup of the original conflict file (only on first save, and only in non-mergetool mode).
    // The backup protects against crashes mid-write. Once the file is saved successfully below, it's removed.
    // In mergetool mode, git already manages its own backup files (app_BACKUP_*).
    if !git::mergetool::is_mergetool_mode() {
        let backup_path = format!("{}.splice.bak", file_path);
        if !std::path::Path::new(&backup_path).exists() {
            let _ = std::fs::write(&backup_path, &session.original_content);
        }
    }

    session.saved = true;

    // Drop the lock before potentially exiting or doing I/O
    drop(guard);

    if !git::mergetool::is_mergetool_mode() {
        let backup_path = format!("{}.splice.bak", file_path);
        let _ = std::fs::remove_file(&backup_path);

        // Stage the resolved file in git to mark the conflict as resolved.
        // First try git2 (direct, no PATH dependency), then fall back to CLI.
        if let Err(e) = stage_in_git(&file_path) {
            eprintln!("Warning: git2 stage failed (trying CLI fallback): {}", e);
            // If git2 fails, try git add via CLI as a fallback.
            // This handles edge cases where git2's index handling differs from git's.
            if let Err(e2) = stage_in_git_cli(&file_path) {
                eprintln!("Warning: CLI git add also failed: {}", e2);
                return Err(format!(
                    "Failed to stage resolved file. Both git2 and CLI fallback failed.\ngit2: {}\nCLI: {}",
                    e, e2
                ));
            }
        }
    }

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

    /// Test that `stage_in_git` works for multiple files in the same repo.
    /// Regression test for: first file stages correctly, subsequent files don't.
    #[test]
    fn test_stage_multiple_files_in_repo() {
        use std::fs;
        use std::process::Command;

        // Create temp dir for test repo
        let tmp = std::env::temp_dir().join(format!("splice_test_stage_{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(&tmp).unwrap();

        // Use git CLI to set up repo (more reliable than git2 for setup)
        let run = |args: &[&str]| {
            let out = Command::new("git")
                .args(args)
                .current_dir(&tmp)
                .output()
                .unwrap();
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                panic!("git command failed: {} {:?}\n{}", args[0], &args[1..], stderr);
            }
        };

        run(&["init"]);
        run(&["config", "user.email", "test@test.com"]);
        run(&["config", "user.name", "Test"]);

        // Initial commit with two files
        let file1_path = tmp.join("file1.txt");
        let file2_path = tmp.join("file2.txt");
        fs::write(&file1_path, "a\nb\nc\n").unwrap();
        fs::write(&file2_path, "d\ne\nf\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "base"]);

        // Feature branch
        run(&["checkout", "-b", "feature"]);
        fs::write(&file1_path, "a1\nb1\nc1\n").unwrap();
        fs::write(&file2_path, "d1\ne1\nf1\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "feature-change"]);

        // Back to master, conflicting changes
        run(&["checkout", "master"]);
        fs::write(&file1_path, "a2\nb2\nc2\n").unwrap();
        fs::write(&file2_path, "d2\ne2\nf2\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-m", "master-change"]);

        // Merge to create conflicts
        let merge_out = Command::new("git")
            .args(["merge", "feature"])
            .current_dir(&tmp)
            .output()
            .unwrap();
        let merge_stderr = String::from_utf8_lossy(&merge_out.stderr);
        let merge_stdout = String::from_utf8_lossy(&merge_out.stdout);
        eprintln!("merge stdout: {}", merge_stdout);
        eprintln!("merge stderr: {}", merge_stderr);
        assert!(
            merge_stderr.contains("CONFLICT") || merge_stdout.contains("CONFLICT"),
            "Should have merge conflicts. exit={:?} stderr={}",
            merge_out.status.code(),
            merge_stderr
        );

        // Verify both files are conflicted
        let status_before = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&tmp)
            .output()
            .unwrap();
        let status_before = String::from_utf8_lossy(&status_before.stdout);
        eprintln!("Status before:\n{}", status_before);
        assert!(status_before.contains("UU file1.txt"), "file1 should be conflicted");
        assert!(status_before.contains("UU file2.txt"), "file2 should be conflicted");

        // Check merge status
        let check_status_cmd = || {
            let out = Command::new("git")
                .args(["status", "--porcelain"])
                .current_dir(&tmp)
                .output()
                .unwrap();
            String::from_utf8_lossy(&out.stdout).to_string()
        };
        eprintln!("Status at conflict: {}", check_status_cmd());

        // ── Simulate resolving: write resolved content ──
        fs::write(&file1_path, "RESOLVED-a\n").unwrap();
        fs::write(&file2_path, "RESOLVED-d\n").unwrap();

        // Stage file1 using the exact same pattern as stage_in_git
        eprintln!("\n--- Staging file1 ---");
        {
            let repo = git2::Repository::open(tmp.join("file1.txt").parent().unwrap()).unwrap();
            let workdir = repo.workdir().unwrap().to_path_buf();
            let canonical = std::fs::canonicalize(&file1_path).unwrap();
            let relative = pathdiff::diff_paths(&canonical, &workdir).unwrap();
            eprintln!("file1 canonical: {:?}", canonical);
            eprintln!("file1 workdir: {:?}", workdir);
            eprintln!("file1 relative: {:?}", relative);
            let mut index = repo.index().unwrap();
            match index.add_path(&relative) {
                Ok(_) => eprintln!("file1 add_path OK"),
                Err(e) => eprintln!("file1 add_path ERROR: {:?}", e),
            }
            match index.write() {
                Ok(_) => eprintln!("file1 index.write OK"),
                Err(e) => eprintln!("file1 index.write ERROR: {:?}", e),
            }
        }

        let status_mid = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&tmp)
            .output()
            .unwrap();
        eprintln!("Status after file1:\n{}", String::from_utf8_lossy(&status_mid.stdout));

        // Stage file2
        eprintln!("\n--- Staging file2 ---");
        {
            let repo = git2::Repository::open(tmp.join("file2.txt").parent().unwrap()).unwrap();
            let workdir = repo.workdir().unwrap().to_path_buf();
            let canonical = std::fs::canonicalize(&file2_path).unwrap();
            let relative = pathdiff::diff_paths(&canonical, &workdir).unwrap();
            eprintln!("file2 canonical: {:?}", canonical);
            eprintln!("file2 workdir: {:?}", workdir);
            eprintln!("file2 relative: {:?}", relative);
            let mut index = repo.index().unwrap();
            match index.add_path(&relative) {
                Ok(_) => eprintln!("file2 add_path OK"),
                Err(e) => eprintln!("file2 add_path ERROR: {:?}", e),
            }
            match index.write() {
                Ok(_) => eprintln!("file2 index.write OK"),
                Err(e) => eprintln!("file2 index.write ERROR: {:?}", e),
            }
        }

        let status_final = Command::new("git")
            .args(["status", "--porcelain"])
            .current_dir(&tmp)
            .output()
            .unwrap();
        let status_final_str = String::from_utf8_lossy(&status_final.stdout);
        eprintln!("Status final:\n{}", status_final_str);

        // Verify: both files should show as staged (M in the index column)
        assert!(
            status_final_str.contains("M  file1.txt"),
            "file1 should be staged (M in index column), got:\n{}",
            status_final_str
        );
        assert!(
            status_final_str.contains("M  file2.txt"),
            "file2 should be staged (M in index column), got:\n{}",
            status_final_str
        );

        // Cleanup
        let _ = fs::remove_dir_all(&tmp);
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

    #[test]
    /// Regression test: content loss when local and remote have DIFFERENT line counts.
    /// The bug was that lineIdx advanced by the resolved line count instead of the
    /// local line count, causing subsequent normal lines to use wrong highlighted[] indices
    /// resulting in blank content. This test validates the backend build_result_content
    /// is correct for this scenario.
    fn test_local_remote_different_line_counts_content_after_preserved() {
        // local=3 lines, remote=1 line — the asymmetric case that causes content loss
        let content = concat!(
            "before\n",
            "<<<<<<< HEAD\n",
            "local_line_1\n",
            "local_line_2\n",
            "local_line_3\n",
            "=======\n",
            "remote_line_1\n",
            ">>>>>>> branch\n",
            "after\n",
        );
        let mut session = build_session(content);
        assert_eq!(session.total_count, 1);
        assert_eq!(session.conflicts[0].local_lines.len(), 3);
        assert_eq!(session.conflicts[0].remote_lines.len(), 1);

        // Resolve with Remote
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithRemote);
        let result = build_result_content(&session);
        // Should contain "after" — this was getting lost before the fix
        assert!(result.contains("after"), "Content after conflict should be preserved");
        assert!(!result.contains("local_line"), "Should not contain local content when resolved with remote");
        assert_eq!(result, "before\nremote_line_1\nafter\n");

        // Resolve with Local
        let mut session2 = build_session(content);
        session2.resolve_conflict(1, parser::ConflictStatus::ResolvedWithLocal);
        let result2 = build_result_content(&session2);
        assert_eq!(result2, "before\nlocal_line_1\nlocal_line_2\nlocal_line_3\nafter\n",
            "Local resolve should keep all 3 local lines + surrounding content");

        // Resolve with Both
        let mut session3 = build_session(content);
        session3.resolve_conflict(1, parser::ConflictStatus::ResolvedWithBoth);
        let result3 = build_result_content(&session3);
        assert!(result3.contains("after"), "Both resolve should preserve content after conflict");
        assert_eq!(result3, "before\nlocal_line_1\nlocal_line_2\nlocal_line_3\nremote_line_1\nafter\n",
            "Both should show local then remote, then 'after'");
    }

    #[test]
    /// Regression test: multiple conflicts with asymmetric line counts.
    fn test_multiple_conflicts_asymmetric_line_counts() {
        let content = concat!(
            "header\n",
            "<<<<<<< HEAD\n",
            "local_A_long\n",
            "local_A_extra\n",
            "=======\n",
            "remote_A\n",
            ">>>>>>> branch\n",
            "middle_shared\n",
            "<<<<<<< HEAD\n",
            "local_B\n",
            "=======\n",
            "remote_B_long\n",
            "remote_B_extra\n",
            "remote_B_third\n",
            ">>>>>>> branch\n",
            "footer\n",
        );
        let mut session = build_session(content);
        assert_eq!(session.total_count, 2);
        assert_eq!(session.conflicts[0].local_lines.len(), 2);
        assert_eq!(session.conflicts[0].remote_lines.len(), 1);
        assert_eq!(session.conflicts[1].local_lines.len(), 1);
        assert_eq!(session.conflicts[1].remote_lines.len(), 3);

        // Resolve first with Local, second with Remote
        // Resolve first with Local, second with Remote
        session.resolve_conflict(1, parser::ConflictStatus::ResolvedWithLocal);
        session.resolve_conflict(2, parser::ConflictStatus::ResolvedWithRemote);

        let result = build_result_content(&session);
        assert!(result.contains("header"), "Should preserve header");
        assert!(result.contains("middle_shared"), "Should preserve middle shared content");
        assert!(result.contains("footer"), "Should preserve footer");
        assert!(!result.contains("<<<<<<<"), "All conflicts resolved, no markers");
        assert_eq!(result, "header\nlocal_A_long\nlocal_A_extra\nmiddle_shared\nremote_B_long\nremote_B_extra\nremote_B_third\nfooter\n");
    }
}
