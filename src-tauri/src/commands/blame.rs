use std::collections::HashMap;
use std::sync::Mutex;

use crate::parser;

/// Get blame information for both sides of each conflict block.
///
/// `local` side: blames against HEAD — showing who last modified each line
/// on the current branch.
/// `remote` side: blames against MERGE_HEAD — showing who last modified each
/// line in the incoming branch.
/// Returns empty `BlameMap`s for sides that cannot be resolved (silent degrade).
#[tauri::command]
pub fn get_blame(
    file_path: String,
    state: tauri::State<'_, Mutex<HashMap<String, parser::MergeSession>>>,
) -> Result<parser::SideBlame, String> {
    let sessions = state.lock().map_err(|e| format!("State lock error: {}", e))?;
    let session = sessions
        .get(&file_path)
        .ok_or_else(|| "Session not found for file".to_string())?;

    let repo_path = std::path::Path::new(&file_path)
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let repo = git2::Repository::open(repo_path)
        .map_err(|e| format!("Cannot open git repo: {}", e))?;

    let relative_path = get_relative_path(&file_path, &repo);
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Repo has no workdir".to_string())?;

    // ── Local side: blame against HEAD ──
    let local = blame_side(
        &repo,
        workdir,
        &session.conflicts,
        &relative_path,
        |c| &c.local_lines,
        "HEAD",
    );

    // ── Remote side: blame against MERGE_HEAD (silent degrade if not in merge) ──
    let remote = blame_side(
        &repo,
        workdir,
        &session.conflicts,
        &relative_path,
        |c| &c.remote_lines,
        "MERGE_HEAD",
    );

    Ok(parser::SideBlame { local, remote })
}

/// Blame lines of conflict blocks against a named git reference.
///
/// Reads the file content at `ref_name`, locates each conflict's lines as a
/// contiguous block, and runs `git blame --line-porcelain <ref> -- <file>`
/// on that range.  Uses the actual tracked file path — no temp file needed.
/// Returns an empty map if the ref doesn't exist or any error occurs.
fn blame_side(
    repo: &git2::Repository,
    workdir: &std::path::Path,
    conflicts: &[parser::ConflictBlock],
    relative_path: &str,
    get_lines: impl Fn(&parser::ConflictBlock) -> &Vec<String>,
    ref_name: &str,
) -> parser::BlameMap {
    let commit = match repo.find_reference(ref_name) {
        Ok(r) => match r.peel_to_commit() {
            Ok(c) => c,
            Err(_) => return parser::BlameMap::new(),
        },
        Err(_) => return parser::BlameMap::new(),
    };

    let content = match show_file_at_commit(repo, &commit, relative_path) {
        Ok(c) => c,
        Err(_) => return parser::BlameMap::new(),
    };

    let ref_lines: Vec<&str> = content.lines().collect();

    let mut result = parser::BlameMap::new();

    for conflict in conflicts {
        let lines: Vec<&str> = get_lines(conflict)
            .iter()
            .map(|s| s.as_str())
            .collect();
        if lines.is_empty() {
            continue;
        }

        let line_start = match find_contiguous(&ref_lines, &lines) {
            Some(s) => s,
            None => continue,
        };
        let blame_start = line_start + 1;
        let blame_end = line_start + lines.len();

        // Run git blame directly against the ref and tracked file path
        let blame_output = match run_git_blame_on_ref(
            workdir,
            relative_path,
            blame_start,
            blame_end,
            ref_name,
        ) {
            Ok(o) => o,
            Err(_) => continue,
        };

        let parsed = parse_blame_output(&blame_output, lines.len());
        result.insert(conflict.id, parsed);
    }

    result
}

/// Get the file content at a specific commit via `git show`.
fn show_file_at_commit(
    repo: &git2::Repository,
    commit: &git2::Commit,
    relative_path: &str,
) -> Result<String, String> {
    let tree = commit
        .tree()
        .map_err(|e| format!("Cannot get commit tree: {}", e))?;
    let entry = tree
        .get_path(std::path::Path::new(relative_path))
        .map_err(|e| format!("File not found in MERGE_HEAD tree: {}", e))?;
    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("Cannot find blob: {}", e))?;
    Ok(String::from_utf8_lossy(blob.content()).to_string())
}

/// Run `git blame --line-porcelain <ref> -- <path>` for a specific line range.
///
/// Blames against a git ref (e.g. HEAD, MERGE_HEAD) directly on the tracked
/// file — no temp file needed because the content lives in the object store.
fn run_git_blame_on_ref(
    workdir: &std::path::Path,
    relative_path: &str,
    start_line: usize,
    end_line: usize,
    ref_name: &str,
) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .arg("blame")
        .arg("--line-porcelain")
        .arg("-L")
        .arg(format!("{},{}", start_line, end_line))
        .arg(ref_name)
        .arg("--")
        .arg(relative_path)
        .current_dir(workdir)
        .output()
        .map_err(|e| format!("Failed to run git blame: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git blame failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Find a contiguous subsequence in `haystack` matching `needle`.
/// Returns the starting index (0-based) if found, None otherwise.
fn find_contiguous<'a>(haystack: &[&'a str], needle: &[&'a str]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

/// Parse `git blame --line-porcelain` output into BlameLine entries.
///
/// The porcelain format emits per-line commit info followed by the line content.
/// Example structure (line starting with `\t` is the content line):
/// ```text
/// abc1234 1 filename.txt
/// author John Doe
/// author-mail john@example.com
/// author-time 1234567890
/// author-tz +0800
/// summary Fix the bug
///         the actual line content
/// ```
fn parse_blame_output(output: &str, line_count: usize) -> Vec<parser::BlameLine> {
    let mut result = Vec::new();
    let mut lines = output.lines().peekable();
    let mut line_index = 0usize;

    while let Some(line) = lines.next() {
        // Each blame hunk starts with a line like: commit_hash source_line filename
        // The line starts with a 40-char hex hash (or shorter for abbrev)
        let commit_hash_end = match line.find(' ') {
            Some(pos) => pos,
            None => continue,
        };
        let commit_hash = &line[..commit_hash_end];

        if commit_hash.len() < 7 && commit_hash != "0000000" {
            // Not a blame header line, skip
            continue;
        }

        let mut author = String::from("unknown");
        let mut date = String::new();
        let mut commit_message = String::new();

        // Read the metadata lines until we hit the content line
        loop {
            match lines.peek() {
                Some(meta) if meta.starts_with("author ") => {
                    author = meta[7..].to_string();
                    lines.next();
                }
                Some(meta) if meta.starts_with("author-time ") => {
                    // Convert unix timestamp to readable date
                    let ts: i64 = meta[12..].parse().unwrap_or(0);
                    use std::time::UNIX_EPOCH;
                    let dur = std::time::Duration::from_secs(ts.max(0) as u64);
                    let dt = UNIX_EPOCH + dur;
                    // Format as YYYY-MM-DD HH:MM
                    if let Some(formatted) = format_timestamp(dt) {
                        date = formatted;
                    }
                    lines.next();
                }
                Some(meta) if meta.starts_with("summary ") => {
                    commit_message = meta[8..].to_string();
                    lines.next();
                }
                Some(meta) if meta.starts_with('\t') => {
                    // Content line — end of this hunk
                    break;
                }
                Some(_) => {
                    lines.next(); // skip other metadata
                }
                None => break,
            }
        }

        let display_hash = if commit_hash.len() >= 7 {
            commit_hash[..7].to_string()
        } else {
            commit_hash.to_string()
        };

        if line_index < line_count {
            result.push(parser::BlameLine {
                author,
                date,
                commit_hash: display_hash,
                commit_message,
                line_index,
            });
            line_index += 1;
        }

        // Skip past the content line
        let _ = lines.next();
    }

    result
}

/// Format a SystemTime as "YYYY-MM-DD HH:MM".
fn format_timestamp(dt: std::time::SystemTime) -> Option<String> {
    use std::time::UNIX_EPOCH;
    let secs = dt.duration_since(UNIX_EPOCH).ok()?.as_secs();

    // Simple conversion without external dep
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;

    // Days since epoch to date (years are leap-aware 2001-2100 approximation)
    let mut y = 1970i64;
    let mut d = days as i64;
    loop {
        let year_days = if is_leap(y) { 366 } else { 365 };
        if d < year_days {
            break;
        }
        d -= year_days;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0;
    for days_in_m in month_days.iter() {
        if d < *days_in_m as i64 {
            break;
        }
        d -= *days_in_m as i64;
        m += 1;
    }

    Some(format!(
        "{:04}-{:02}-{:02} {:02}:{:02}",
        y,
        m + 1,
        d + 1,
        hours,
        minutes
    ))
}

fn is_leap(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn get_relative_path(absolute: &str, repo: &git2::Repository) -> String {
    let abs_path = std::path::Path::new(absolute);
    let workdir = repo.workdir().unwrap_or_else(|| std::path::Path::new("."));
    pathdiff::diff_paths(abs_path, workdir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            abs_path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default()
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::BlameLine;

    // ── find_contiguous ──

    #[test]
    fn test_find_contiguous_exact_match() {
        let haystack: Vec<&str> = vec!["a", "b", "c", "d"];
        let needle: Vec<&str> = vec!["b", "c"];
        assert_eq!(find_contiguous(&haystack, &needle), Some(1));
    }

    #[test]
    fn test_find_contiguous_at_start() {
        let haystack: Vec<&str> = vec!["x", "y", "z"];
        let needle: Vec<&str> = vec!["x", "y"];
        assert_eq!(find_contiguous(&haystack, &needle), Some(0));
    }

    #[test]
    fn test_find_contiguous_at_end() {
        let haystack: Vec<&str> = vec!["a", "b", "c"];
        let needle: Vec<&str> = vec!["b", "c"];
        assert_eq!(find_contiguous(&haystack, &needle), Some(1));
    }

    #[test]
    fn test_find_contiguous_not_found() {
        let haystack: Vec<&str> = vec!["a", "b", "c"];
        let needle: Vec<&str> = vec!["x", "y"];
        assert_eq!(find_contiguous(&haystack, &needle), None);
    }

    #[test]
    fn test_find_contiguous_needle_too_large() {
        let haystack: Vec<&str> = vec!["a", "b"];
        let needle: Vec<&str> = vec!["a", "b", "c"];
        assert_eq!(find_contiguous(&haystack, &needle), None);
    }

    #[test]
    fn test_find_contiguous_empty_needle() {
        let haystack: Vec<&str> = vec!["a", "b"];
        let needle: Vec<&str> = vec![];
        assert_eq!(find_contiguous(&haystack, &needle), None);
    }

    #[test]
    fn test_find_contiguous_single_line() {
        let haystack: Vec<&str> = vec!["p", "q", "r"];
        let needle: Vec<&str> = vec!["q"];
        assert_eq!(find_contiguous(&haystack, &needle), Some(1));
    }

    #[test]
    fn test_find_contiguous_duplicates() {
        let haystack: Vec<&str> = vec!["a", "b", "a", "b", "c"];
        let needle: Vec<&str> = vec!["a", "b"];
        assert_eq!(find_contiguous(&haystack, &needle), Some(0));
    }

    // ── is_leap ──

    #[test]
    fn test_is_leap_typical() {
        assert!(is_leap(2000));
        assert!(is_leap(2004));
        assert!(is_leap(2024));
        assert!(is_leap(2400));
    }

    #[test]
    fn test_is_not_leap() {
        assert!(!is_leap(1900));
        assert!(!is_leap(2001));
        assert!(!is_leap(2023));
        assert!(!is_leap(2100));
    }

    #[test]
    fn test_is_leap_year_1970() {
        assert!(!is_leap(1970));
    }

    // ── format_timestamp ──

    #[test]
    fn test_format_timestamp_epoch() {
        let dt = std::time::UNIX_EPOCH;
        let formatted = format_timestamp(dt);
        assert_eq!(formatted, Some("1970-01-01 00:00".to_string()));
    }

    #[test]
    fn test_format_timestamp_mid_2023() {
        // 2023-06-15 12:30 UTC = 1686832200
        let dur = std::time::Duration::from_secs(1_686_832_200);
        let dt = std::time::UNIX_EPOCH + dur;
        let formatted = format_timestamp(dt);
        assert_eq!(formatted, Some("2023-06-15 12:30".to_string()));
    }

    #[test]
    fn test_format_timestamp_leap_feb_29() {
        // 2024-02-29 00:00 UTC = 1709164800
        let dur = std::time::Duration::from_secs(1_709_164_800);
        let dt = std::time::UNIX_EPOCH + dur;
        let formatted = format_timestamp(dt);
        assert_eq!(formatted, Some("2024-02-29 00:00".to_string()));
    }

    #[test]
    fn test_format_timestamp_year_boundary() {
        // 2024-12-31 23:59 UTC
        let dur = std::time::Duration::from_secs(1_735_689_540);
        let dt = std::time::UNIX_EPOCH + dur;
        let formatted = format_timestamp(dt);
        assert_eq!(formatted, Some("2024-12-31 23:59".to_string()));
    }

    #[test]
    fn test_format_timestamp_new_year() {
        // 2025-01-01 00:00 UTC = 1735689600
        let dur = std::time::Duration::from_secs(1_735_689_600);
        let dt = std::time::UNIX_EPOCH + dur;
        let formatted = format_timestamp(dt);
        assert_eq!(formatted, Some("2025-01-01 00:00".to_string()));
    }

    // ── parse_blame_output ──

    /// Build a mock git blame --line-porcelain output.
    fn make_blame_output(lines: &[&str], author: &str, date_ts: &str, msg: &str) -> String {
        let mut out = String::new();
        for (i, line) in lines.iter().enumerate() {
            let hash = format!("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a{:02x}", i + 1);
            out.push_str(&format!("{} {} {}\n", hash, i + 1, "file.ts"));
            out.push_str(&format!("author {}\n", author));
            out.push_str("author-mail <user@example.com>\n");
            out.push_str(&format!("author-time {}\n", date_ts));
            out.push_str("author-tz +0800\n");
            out.push_str(&format!("summary {}\n", msg));
            out.push_str(&format!("\t{}\n", line));
        }
        out
    }

    #[test]
    fn test_parse_blame_output_single_line() {
        let output = make_blame_output(&["remote_line"], "Alice", "1700000000", "Add feature");
        let result = parse_blame_output(&output, 1);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].author, "Alice");
        assert_eq!(result[0].commit_hash.len(), 7);
        assert_eq!(result[0].line_index, 0);
        assert!(result[0].commit_message.contains("Add feature"));
    }

    #[test]
    fn test_parse_blame_output_multiple_lines() {
        let output = make_blame_output(
            &["line_a", "line_b", "line_c"],
            "Bob",
            "1710000000",
            "Big refactor",
        );
        let result = parse_blame_output(&output, 3);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].line_index, 0);
        assert_eq!(result[1].line_index, 1);
        assert_eq!(result[2].line_index, 2);
        for entry in &result {
            assert_eq!(entry.author, "Bob");
        }
    }

    #[test]
    fn test_parse_blame_output_truncates_to_line_count() {
        let output = make_blame_output(
            &["l1", "l2", "l3", "l4"],
            "Charlie",
            "1720000000",
            "Multiple changes",
        );
        let result = parse_blame_output(&output, 2);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_parse_blame_output_empty_output() {
        let result = parse_blame_output("", 5);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_blame_output_zero_line_count() {
        let output = make_blame_output(&["only_line"], "Dave", "1730000000", "Init");
        let result = parse_blame_output(&output, 0);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_blame_output_different_commit_hashes() {
        let mut out = String::new();
        // First line from commit ABC
        out.push_str("abc1234567890123456789012345678901234567 1 file.ts\n");
        out.push_str("author Eve\n");
        out.push_str("author-mail <eve@example.com>\n");
        out.push_str("author-time 1700000000\n");
        out.push_str("author-tz +0800\n");
        out.push_str("summary First\n");
        out.push_str("\tline1\n");
        // Second line from commit XYZ
        out.push_str("xyz7890123456789012345678901234567890123 2 file.ts\n");
        out.push_str("author Frank\n");
        out.push_str("author-mail <frank@example.com>\n");
        out.push_str("author-time 1710000000\n");
        out.push_str("author-tz +0800\n");
        out.push_str("summary Second\n");
        out.push_str("\tline2\n");

        let result = parse_blame_output(&out, 2);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].author, "Eve");
        assert_eq!(result[1].author, "Frank");
        assert_ne!(result[0].commit_hash, result[1].commit_hash);
    }

    #[test]
    fn test_blame_line_struct_defaults() {
        let line = BlameLine {
            author: "TestAuthor".to_string(),
            date: "2024-01-15 10:30".to_string(),
            commit_hash: "abc1234".to_string(),
            commit_message: "Fix bug".to_string(),
            line_index: 42,
        };
        assert_eq!(line.author, "TestAuthor");
        assert_eq!(line.date, "2024-01-15 10:30");
        assert_eq!(line.commit_hash, "abc1234");
        assert_eq!(line.commit_message, "Fix bug");
        assert_eq!(line.line_index, 42);
    }

    // ── SideBlame ──

    #[test]
    fn test_side_blame_both_sides() {
        use crate::parser::{BlameMap, SideBlame};
        let mut local = BlameMap::new();
        local.insert(
            1,
            vec![BlameLine {
                author: "Alice".to_string(),
                date: "2024-06-01".to_string(),
                commit_hash: "abc1234".to_string(),
                commit_message: "Fix local".to_string(),
                line_index: 0,
            }],
        );
        let mut remote = BlameMap::new();
        remote.insert(
            1,
            vec![BlameLine {
                author: "Bob".to_string(),
                date: "2024-06-15".to_string(),
                commit_hash: "def5678".to_string(),
                commit_message: "Fix remote".to_string(),
                line_index: 0,
            }],
        );
        let side_blame = SideBlame { local, remote };
        assert_eq!(side_blame.local.get(&1).unwrap()[0].author, "Alice");
        assert_eq!(side_blame.remote.get(&1).unwrap()[0].author, "Bob");
    }
}
