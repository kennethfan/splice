use serde::{Deserialize, Serialize};
use imara_diff::{Algorithm, InternedInput, Diff};

/// The diff status of a single line
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LineDiff {
    /// Line is unchanged between versions
    Unchanged,
    /// Line was added in this version (not present in BASE)
    Added,
    /// Line was removed from BASE in this version
    Removed,
    /// Line was modified (has word-level changes)
    Modified,
}

/// A word-level change within a line
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordChange {
    /// The word/token content
    pub text: String,
    /// Whether this part was added, removed, or unchanged
    pub status: String,
}

/// Diff result for a single conflict block
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockDiff {
    /// Line-level diff for LOCAL vs BASE
    pub local_vs_base: Vec<LineDiff>,
    /// Line-level diff for REMOTE vs BASE
    pub remote_vs_base: Vec<LineDiff>,
    /// Word-level changes for each modified line in LOCAL
    pub local_word_changes: Vec<Vec<WordChange>>,
    /// Word-level changes for each modified line in REMOTE
    pub remote_word_changes: Vec<Vec<WordChange>>,
}

/// Compute line-level diff between two slices of lines.
/// Returns one LineDiff per line in `b` (the target).
fn compute_line_diff(a: &[&str], b: &[&str]) -> Vec<LineDiff> {
    if a == b {
        return vec![LineDiff::Unchanged; b.len()];
    }

    // Join lines with newline to get back the original text.
    // imara_diff's line tokenizer INCLUDES the newline in each token,
    // so we must add a trailing \n to each line for correct matching.
    // However, empty inputs should remain empty strings (not just "\n").
    let before = if a.is_empty() {
        String::new()
    } else {
        a.join("\n") + "\n"
    };
    let after = if b.is_empty() {
        String::new()
    } else {
        b.join("\n") + "\n"
    };

    let input = InternedInput::new(before.as_str(), after.as_str());
    let diff = Diff::compute(Algorithm::Myers, &input);

    let mut result = vec![LineDiff::Unchanged; b.len()];

    for hunk in diff.hunks() {
        if hunk.after.is_empty() {
            // Pure deletion — no corresponding entries in b
            continue;
        }
        let is_insert = hunk.before.is_empty();
        let status = if is_insert {
            LineDiff::Added
        } else {
            LineDiff::Modified
        };
        for i in hunk.after {
            if (i as usize) < b.len() {
                result[i as usize] = status;
            }
        }
    }

    result
}

/// Tokenize a line into words for word-level diff.
fn tokenize_line(line: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in line.chars() {
        if ch.is_alphanumeric() || ch == '_' {
            current.push(ch);
        } else {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
            // Include the delimiter as its own token
            tokens.push(ch.to_string());
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

/// Compute word-level diff between two strings.
fn compute_word_diff(a: &str, b: &str) -> Vec<WordChange> {
    let a_tokens = tokenize_line(a);
    let b_tokens = tokenize_line(b);

    if a_tokens.is_empty() && b_tokens.is_empty() {
        return vec![];
    }

    // Fast path: identical
    if a_tokens == b_tokens {
        return b_tokens
            .iter()
            .map(|t| WordChange {
                text: t.clone(),
                status: "unchanged".to_string(),
            })
            .collect();
    }

    // Use line diff on joined word strings — each "line" is a word.
    // This works because code words never contain newlines.
    // imara_diff's TokenSource includes \n in each token, so add trailing \n.
    // Empty inputs stay empty (not just "\n").
    let before_lines: Vec<&str> = a_tokens.iter().map(|s| s.as_str()).collect();
    let after_lines: Vec<&str> = b_tokens.iter().map(|s| s.as_str()).collect();

    let before_str = if before_lines.is_empty() {
        String::new()
    } else {
        before_lines.join("\n") + "\n"
    };
    let after_str = if after_lines.is_empty() {
        String::new()
    } else {
        after_lines.join("\n") + "\n"
    };

    let input = InternedInput::new(before_str.as_str(), after_str.as_str());
    let diff = Diff::compute(Algorithm::Myers, &input);

    let hunks: Vec<_> = diff.hunks().collect();
    let mut changes = Vec::new();
    let mut a_pos: usize = 0;

    // Walk through all target (b) tokens, emitting "removed" for replacements
    for (i, b_token) in b_tokens.iter().enumerate() {
        let hunk = hunks.iter().find(|h| h.after.contains(&(i as u32)));

        if let Some(h) = hunk {
            // Emit "removed" tokens for the before-side of this hunk
            if !h.before.is_empty() {
                let start = a_pos;
                let end = h.before.end as usize;
                for token in a_tokens.iter().take(end).skip(start) {
                    changes.push(WordChange {
                        text: token.clone(),
                        status: "removed".to_string(),
                    });
                }
                a_pos = end;
            }

            // Now emit the after-side token
            if h.before.is_empty() {
                changes.push(WordChange {
                    text: b_token.clone(),
                    status: "added".to_string(),
                });
            } else {
                changes.push(WordChange {
                    text: b_token.clone(),
                    status: "modified".to_string(),
                });
            }
        } else {
            changes.push(WordChange {
                text: b_token.clone(),
                status: "unchanged".to_string(),
            });
            if a_pos < a_tokens.len() {
                a_pos += 1;
            }
        }
    }

    // Pure deletions at the end
    for hunk in &hunks {
        if !hunk.before.is_empty() && hunk.after.is_empty() {
            for token in a_tokens.iter().take(hunk.before.end as usize).skip(hunk.before.start as usize) {
                changes.push(WordChange {
                    text: token.clone(),
                    status: "removed".to_string(),
                });
            }
        }
    }

    changes
}

/// Compute full diff for a single conflict block.
pub fn compute_block_diff(
    local_lines: &[String],
    base_lines: Option<&[String]>,
    remote_lines: &[String],
) -> BlockDiff {
    let base = base_lines.unwrap_or(&[]);

    let local_refs: Vec<&str> = local_lines.iter().map(|s| s.as_str()).collect();
    let base_refs: Vec<&str> = base.iter().map(|s| s.as_str()).collect();
    let remote_refs: Vec<&str> = remote_lines.iter().map(|s| s.as_str()).collect();

    let local_vs_base = compute_line_diff(&base_refs, &local_refs);
    let remote_vs_base = compute_line_diff(&base_refs, &remote_refs);

    // Word-level diffs for modified lines
    let local_word_changes: Vec<Vec<WordChange>> = local_lines
        .iter()
        .zip(local_vs_base.iter())
        .filter_map(|(line, diff)| {
            if matches!(diff, LineDiff::Modified) {
                let base_line_idx = local_vs_base
                    .iter()
                    .take(local_lines.iter().position(|l| l == line).unwrap_or(0))
                    .filter(|d| matches!(d, LineDiff::Unchanged | LineDiff::Removed))
                    .count();
                let base_line = base_lines
                    .and_then(|b| b.get(base_line_idx.min(b.len().saturating_sub(1))))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                Some(compute_word_diff(base_line, line))
            } else {
                None
            }
        })
        .collect();

    let remote_word_changes: Vec<Vec<WordChange>> = remote_lines
        .iter()
        .zip(remote_vs_base.iter())
        .filter_map(|(line, diff)| {
            if matches!(diff, LineDiff::Modified) {
                let base_line_idx = remote_vs_base
                    .iter()
                    .take(remote_lines.iter().position(|l| l == line).unwrap_or(0))
                    .filter(|d| matches!(d, LineDiff::Unchanged | LineDiff::Removed))
                    .count();
                let base_line = base_lines
                    .and_then(|b| b.get(base_line_idx.min(b.len().saturating_sub(1))))
                    .map(|s| s.as_str())
                    .unwrap_or("");
                Some(compute_word_diff(base_line, line))
            } else {
                None
            }
        })
        .collect();

    BlockDiff {
        local_vs_base,
        remote_vs_base,
        local_word_changes,
        remote_word_changes,
    }
}

/// Compute diffs for all conflict blocks in a session.
pub fn compute_session_diffs(
    conflicts: &[crate::parser::ConflictBlock],
) -> Vec<BlockDiff> {
    conflicts
        .iter()
        .map(|c| {
            compute_block_diff(
                &c.local_lines,
                c.base_lines.as_deref(),
                &c.remote_lines,
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Tokenization ──

    #[test]
    fn test_tokenize_simple() {
        let tokens = tokenize_line("hello world");
        assert!(!tokens.is_empty());
        assert!(tokens.contains(&"hello".to_string()));
        assert!(tokens.contains(&"world".to_string()));
    }

    #[test]
    fn test_tokenize_with_punctuation() {
        let tokens = tokenize_line("fn foo(x: i32)");
        assert!(tokens.contains(&"fn".to_string()));
        assert!(tokens.contains(&"foo".to_string()));
        assert!(tokens.contains(&"x".to_string()));
        assert!(tokens.contains(&"i32".to_string()));
    }

    #[test]
    fn test_tokenize_empty() {
        let tokens = tokenize_line("");
        assert!(tokens.is_empty());
    }

    #[test]
    fn test_tokenize_unicode() {
        let tokens = tokenize_line("const x = \"你好\";");
        assert!(tokens.contains(&"const".to_string()));
        assert!(tokens.contains(&"你好".to_string()));
    }

    #[test]
    fn test_tokenize_only_delimiters() {
        let tokens = tokenize_line("   ");
        // Spaces are delimiters, each becomes a token
        assert_eq!(tokens.len(), 3);
        assert_eq!(tokens, vec![" ".to_string(), " ".to_string(), " ".to_string()]);
    }

    // ── Line-level diff ──

    #[test]
    fn test_line_diff_identical() {
        let local = vec!["const x = 1;".to_string()];
        let base = vec!["const x = 1;".to_string()];
        let remote = vec!["const x = 1;".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.local_vs_base, vec![LineDiff::Unchanged]);
        assert_eq!(diff.remote_vs_base, vec![LineDiff::Unchanged]);
    }

    #[test]
    fn test_line_diff_added() {
        let local = vec![];
        let base: Vec<String> = vec![];
        let remote = vec!["new line".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.remote_vs_base, vec![LineDiff::Added]);
    }

    #[test]
    fn test_line_diff_deleted() {
        let local = vec!["surviving line".to_string()];
        let base = vec!["surviving line".to_string(), "removed line".to_string()];
        let remote = vec!["surviving line".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.local_vs_base.len(), 1);
        assert_eq!(diff.remote_vs_base.len(), 1);
    }

    #[test]
    fn test_line_diff_modified() {
        let local = vec!["const x = 1;".to_string()];
        let base = vec!["const x = 0;".to_string()];
        let remote = vec!["const x = 1;".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.local_vs_base, vec![LineDiff::Modified]);
        // remote also differs from base: "const x = 1;" vs "const x = 0;"
        assert_eq!(diff.remote_vs_base, vec![LineDiff::Modified]);
    }

    #[test]
    fn test_line_diff_both_modified() {
        let local = vec!["const x = 1;".to_string()];
        let base = vec!["const x = 0;".to_string()];
        let remote = vec!["const x = 2;".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.local_vs_base, vec![LineDiff::Modified]);
        assert_eq!(diff.remote_vs_base, vec![LineDiff::Modified]);
    }

    #[test]
    fn test_line_diff_multiple_lines() {
        let local = vec!["a".to_string(), "b_changed".to_string(), "c".to_string()];
        let base = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let remote = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.local_vs_base, vec![
            LineDiff::Unchanged,
            LineDiff::Modified,
            LineDiff::Unchanged,
        ]);
        assert_eq!(diff.remote_vs_base, vec![
            LineDiff::Unchanged,
            LineDiff::Unchanged,
            LineDiff::Unchanged,
        ]);
    }

    #[test]
    fn test_no_base() {
        let local = vec!["line1".to_string()];
        let remote = vec!["line2".to_string()];

        let diff = compute_block_diff(&local, None, &remote);
        assert_eq!(diff.local_vs_base.len(), 1);
        assert_eq!(diff.remote_vs_base.len(), 1);
    }

    // ── Word-level diff ──

    #[test]
    fn test_word_diff_identical() {
        let changes = compute_word_diff("const x = 1;", "const x = 1;");
        assert!(changes.iter().all(|c| c.status == "unchanged"));
    }

    #[test]
    fn test_word_diff_changed_value() {
        // "const x = 0;" vs "const x = 1;"
        // The tokens for both are: ["const", " ", "x", " ", "=", " ", "0", ";"] and [..., "1", ";"]
        // The change is: "0" replaced by "1", so we get removed("0") then modified("1")
        let changes = compute_word_diff("const x = 0;", "const x = 1;");
        assert_eq!(changes.len(), 9, "should have 9 tokens (8 unchanged + 1 removed + 1 modified)");
        // First 6 tokens are unchanged: const, space, x, space, =, space
        for c in &changes[0..6] {
            assert_eq!(c.status, "unchanged");
        }
        // The "0" is removed
        assert_eq!(changes[6].status, "removed");
        assert_eq!(changes[6].text, "0");
        // The "1" is modified
        assert_eq!(changes[7].status, "modified");
        assert_eq!(changes[7].text, "1");
        // The ";" is unchanged
        assert_eq!(changes[8].status, "unchanged");
        assert_eq!(changes[8].text, ";");
    }

    #[test]
    fn test_word_diff_added_content() {
        let changes = compute_word_diff("", "const x = 1;");
        assert!(changes.iter().all(|c| c.status == "added"));
    }

    #[test]
    fn test_word_diff_removed_content() {
        let changes = compute_word_diff("const x = 1;", "");
        assert!(changes.iter().all(|c| c.status == "removed"));
    }

    #[test]
    fn test_no_word_changes_for_unchanged_lines() {
        let local = vec!["const x = 1;".to_string()];
        let base = vec!["const x = 1;".to_string()];
        let remote = vec!["const x = 1;".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert!(diff.local_word_changes.is_empty());
        assert!(diff.remote_word_changes.is_empty());
    }

    #[test]
    fn test_word_changes_for_modified_lines() {
        let local = vec!["const x = 1;".to_string()];
        let base = vec!["const x = 0;".to_string()];
        let remote = vec!["const y = 2;".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert!(!diff.local_word_changes.is_empty());
        assert!(!diff.remote_word_changes.is_empty());
    }

    // ── Session-level diff ──

    #[test]
    fn test_compute_session_diffs_empty() {
        let diffs = compute_session_diffs(&[]);
        assert!(diffs.is_empty());
    }

    #[test]
    fn test_compute_session_diffs_multiple() {
        use crate::parser::ConflictBlock;
        let c1 = ConflictBlock::new(
            1,
            vec!["a".to_string()],
            Some(vec!["a".to_string()]),
            vec!["b".to_string()],
            1, 3,
        );
        let c2 = ConflictBlock::new(
            2,
            vec!["x".to_string()],
            Some(vec!["y".to_string()]),
            vec!["z".to_string()],
            5, 7,
        );
        let diffs = compute_session_diffs(&[c1, c2]);
        assert_eq!(diffs.len(), 2);
        assert_eq!(diffs[0].local_vs_base, vec![LineDiff::Unchanged]);
        assert_eq!(diffs[1].local_vs_base, vec![LineDiff::Modified]);
    }

    // ── Edge cases ──

    #[test]
    fn test_both_empty_inputs() {
        let local: Vec<String> = vec![];
        let base: Vec<String> = vec![];
        let remote: Vec<String> = vec![];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert!(diff.local_vs_base.is_empty());
        assert!(diff.remote_vs_base.is_empty());
        assert!(diff.local_word_changes.is_empty());
        assert!(diff.remote_word_changes.is_empty());
    }

    #[test]
    fn test_all_three_identical() {
        let lines = vec![
            "line1".to_string(),
            "line2".to_string(),
            "line3".to_string(),
        ];
        let diff = compute_block_diff(&lines, Some(&lines), &lines);
        assert_eq!(diff.local_vs_base, vec![
            LineDiff::Unchanged,
            LineDiff::Unchanged,
            LineDiff::Unchanged,
        ]);
        assert_eq!(diff.remote_vs_base, diff.local_vs_base);
    }

    #[test]
    fn test_only_local_changed_all_lines() {
        let local = vec!["new_a".to_string(), "new_b".to_string()];
        let base = vec!["old_a".to_string(), "old_b".to_string()];
        let remote = vec!["old_a".to_string(), "old_b".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert!(diff.local_vs_base.iter().all(|d| *d == LineDiff::Modified));
        assert!(diff.remote_vs_base.iter().all(|d| *d == LineDiff::Unchanged));
    }

    #[test]
    fn test_longer_local_shorter_base() {
        let local = vec![
            "a".to_string(),
            "b".to_string(),
            "c".to_string(),
            "d_extra".to_string(),
        ];
        let base = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let remote = vec!["a".to_string(), "b".to_string(), "c".to_string()];

        let diff = compute_block_diff(&local, Some(&base), &remote);
        assert_eq!(diff.local_vs_base[0], LineDiff::Unchanged);
        assert_eq!(diff.local_vs_base[1], LineDiff::Unchanged);
        assert_eq!(diff.local_vs_base[2], LineDiff::Unchanged);
        assert_eq!(diff.local_vs_base[3], LineDiff::Added);
        assert_eq!(diff.remote_vs_base.len(), 3);
    }
}
