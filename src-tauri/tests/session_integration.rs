//! Integration tests for MergeSession operations.
//!
//! These tests verify the end-to-end session workflow without requiring Tauri:
//! parsing, resolving, undoing/redoing, magic merge, and save output.
//!
//! Note: Tauri IPC commands (open_file, resolve_conflict, etc.) are thin wrappers
//! around the session logic tested here. Full IPC command integration tests would
//! require the Tauri runtime, which is better suited for end-to-end testing.

/// Helper to create a MergeSession from content strings (no file I/O).
fn make_session(
    content: &str,
    base_content: Option<&str>,
) -> (splice_lib::parser::MergeSession, /* dummy path */ String) {
    let conflicts = splice_lib::parser::lexer::parse_conflicts(content);
    let all_local = splice_lib::parser::lexer::extract_local_content(content);
    let all_remote = splice_lib::parser::lexer::extract_remote_content(content);
    let all_base = base_content.map(|s| s.to_string());

    let session = splice_lib::parser::MergeSession::new(
        "/tmp/test.ts".to_string(),
        conflicts,
        all_local,
        all_remote,
        all_base,
        content.to_string(), // original content with markers
    );

    (session, "/tmp/test.ts".to_string())
}

// ── Parser integration tests with small inline content ──

#[test]
fn test_parse_simple_standard() {
    let content = concat!(
        "shared\n",
        "<<<<<<< HEAD\n",
        "l_change\n",
        "=======\n",
        "r_change\n",
        ">>>>>>> branch\n",
        "shared2\n",
    );

    let (session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 1);
    assert_eq!(session.conflicts[0].local_lines, vec!["l_change"]);
    assert_eq!(session.conflicts[0].remote_lines, vec!["r_change"]);
    assert!(session.conflicts[0].base_lines.is_none());
}

#[test]
fn test_parse_simple_zdiff3() {
    let content = concat!(
        "a\n",
        "<<<<<<< HEAD\n",
        "l1\n",
        "||||||| base\n",
        "b1\n",
        "=======\n",
        "r1\n",
        ">>>>>>> branch\n",
        "z\n",
    );

    let (session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 1);
    assert_eq!(session.conflicts[0].local_lines, vec!["l1"]);
    assert_eq!(session.conflicts[0].base_lines, Some(vec!["b1".to_string()]));
    assert_eq!(session.conflicts[0].remote_lines, vec!["r1"]);
}

#[test]
fn test_parse_consecutive_conflicts() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local1\n",
        "=======\n",
        "remote1\n",
        ">>>>>>> branch\n",
        "<<<<<<< HEAD\n",
        "local2\n",
        "=======\n",
        "remote2\n",
        ">>>>>>> branch\n",
    );

    let (session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 2);
    assert_eq!(session.conflicts[0].local_lines, vec!["local1"]);
    assert_eq!(session.conflicts[1].local_lines, vec!["local2"]);
}

#[test]
fn test_parse_no_conflicts() {
    let content = "normal code\nno conflicts here\n";
    let (session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 0);
}

#[test]
fn test_parse_unclosed_conflict() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local\n",
        "=======\n",
        "remote\n",
    );
    let (session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 1);
    assert_eq!(session.conflicts[0].local_lines, vec!["local"]);
    assert_eq!(session.conflicts[0].remote_lines, vec!["remote"]);
}

#[test]
fn test_parse_only_markers_no_content() {
    let content = "<<<<<<< HEAD\n=======\n>>>>>>> branch\n";
    let (session, _path) = make_session(content, None);
    // Both local and remote are empty -> no conflict block created
    assert_eq!(session.total_count, 0);
}

// ── Fixture file test ──

/// The test fixture from test/fixtures/conflict-test.js
const FIXTURE_CONTENT: &str =
"function greet(name) {
<<<<<<< HEAD
  return \"Hello, \" + name + \"!\";
=======
  return `Hi there, ${name}!`;
>>>>>>> feature/greeting
}

function calculateTotal(items) {
<<<<<<< HEAD
  return items.reduce((sum, item) => sum + item.price, 0);
=======
  let total = 0;
  for (const item of items) {
    total += item.price;
  }
  return total;
>>>>>>> feature/refactor
}

const CONFIG = {
<<<<<<< HEAD
  apiUrl: \"https://api.example.com/v1\",
  timeout: 5000,
  retries: 3,
=======
  apiUrl: \"https://api.example.com/v2\",
  timeout: 10000,
  maxRetries: 5,
>>>>>>> feature/api-update
};

function formatDate(date) {
  const options = { year: \"numeric\", month: \"long\", day: \"numeric\" };
  return date.toLocaleDateString(\"en-US\", options);
}

function validateEmail(email) {
<<<<<<< HEAD
  const re = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return re.test(email);
||||||| parent of abc1234
  // TODO: implement email validation
  return true;
=======
  if (!email || !email.includes(\"@\")) return false;
  const [local, domain] = email.split(\"@\");
  return local.length > 0 && domain.includes(\".\");
>>>>>>> feature/validation
}

// No conflict here
function logMessage(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}
";

#[test]
fn test_parse_fixture_content() {
    let (session, _path) = make_session(FIXTURE_CONTENT, None);

    // Should detect 4 conflict blocks from the fixture
    assert_eq!(session.conflicts.len(), 4);
    assert_eq!(session.resolved_count, 0);

    // Verify first conflict (standard, 1 line each)
    let c1 = &session.conflicts[0];
    assert_eq!(c1.id, 1);
    assert_eq!(c1.start_line, 2);
    assert_eq!(c1.end_line, 6);
    assert_eq!(c1.local_lines.len(), 1);
    assert_eq!(c1.remote_lines.len(), 1);
    assert!(c1.base_lines.is_none());
    assert!(c1.local_lines[0].contains("Hello"));

    // Verify second conflict (standard, multi-line remote)
    let c2 = &session.conflicts[1];
    assert_eq!(c2.id, 2);
    assert_eq!(c2.start_line, 10);
    assert_eq!(c2.end_line, 18);
    assert_eq!(c2.local_lines.len(), 1);
    assert_eq!(c2.remote_lines.len(), 5);
    assert!(c2.base_lines.is_none());

    // Verify third conflict (standard, multi-line both)
    let c3 = &session.conflicts[2];
    assert_eq!(c3.id, 3);
    assert_eq!(c3.start_line, 22);
    assert_eq!(c3.end_line, 30);
    assert_eq!(c3.local_lines.len(), 3);
    assert_eq!(c3.remote_lines.len(), 3);
    assert!(c3.base_lines.is_none());

    // Verify fourth conflict (zdiff3 with BASE)
    let c4 = &session.conflicts[3];
    assert_eq!(c4.id, 4);
    assert_eq!(c4.start_line, 39);
    assert_eq!(c4.end_line, 49);
    assert_eq!(c4.local_lines.len(), 2);
    assert_eq!(c4.remote_lines.len(), 3);
    assert!(c4.base_lines.is_some());
    assert_eq!(c4.base_lines.as_ref().unwrap().len(), 2);
}

// ── Resolve integration ──

#[test]
fn test_resolve_with_conflicts() {
    let content = concat!(
        "a\n",
        "<<<<<<< HEAD\n",
        "local_a\n",
        "=======\n",
        "remote_a\n",
        ">>>>>>> branch\n",
        "b\n",
    );

    let (mut session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 1);
    assert_eq!(session.resolved_count, 0);

    session.resolve_conflict(1, splice_lib::parser::ConflictStatus::ResolvedWithLocal);
    assert_eq!(session.resolved_count, 1);
    assert!(matches!(session.conflicts[0].status, splice_lib::parser::ConflictStatus::ResolvedWithLocal));
}

#[test]
fn test_resolve_invalid_conflict_id() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local\n",
        "=======\n",
        "remote\n",
        ">>>>>>> branch\n",
    );

    let (mut session, _path) = make_session(content, None);
    let prev = session.resolve_conflict(99, splice_lib::parser::ConflictStatus::ResolvedWithLocal);
    assert!(prev.is_none());
    assert_eq!(session.resolved_count, 0);
}

#[test]
fn test_resolve_all_types() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local1\n",
        "=======\n",
        "remote1\n",
        ">>>>>>> branch\n",
        "<<<<<<< HEAD\n",
        "local2\n",
        "=======\n",
        "remote2\n",
        ">>>>>>> branch\n",
    );

    let (mut session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 2);

    session.resolve_conflict(1, splice_lib::parser::ConflictStatus::ResolvedWithLocal);
    session.resolve_conflict(2, splice_lib::parser::ConflictStatus::ResolvedWithRemote);
    assert_eq!(session.resolved_count, 2);
    assert!(session.conflicts[0].is_resolved());
    assert!(session.conflicts[1].is_resolved());
}

// ── Undo/Redo integration ──

#[test]
fn test_undo_redo_workflow() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local\n",
        "=======\n",
        "remote\n",
        ">>>>>>> branch\n",
    );

    let (mut session, _path) = make_session(content, None);
    assert!(session.undo().is_none());

    // Resolve and push undo
    let prev = session.resolve_conflict(1, splice_lib::parser::ConflictStatus::ResolvedWithLocal).unwrap();
    session.push_undo(splice_lib::parser::UndoEntry {
        description: "Resolve 1".to_string(),
        statuses: vec![(1, prev)],
    });
    assert_eq!(session.resolved_count, 1);

    // Undo
    let desc = session.undo();
    assert_eq!(desc, Some("Resolve 1".to_string()));
    assert_eq!(session.resolved_count, 0);
    assert!(matches!(session.conflicts[0].status, splice_lib::parser::ConflictStatus::Unresolved));
    assert_eq!(session.undo_stack.len(), 0);
    assert_eq!(session.redo_stack.len(), 1);

    // Redo
    let desc = session.redo();
    assert_eq!(desc, Some("Resolve 1".to_string()));
    assert_eq!(session.resolved_count, 1);
    assert!(matches!(session.conflicts[0].status, splice_lib::parser::ConflictStatus::ResolvedWithLocal));
    assert_eq!(session.undo_stack.len(), 1);
    assert_eq!(session.redo_stack.len(), 0);

    // No more redos
    assert!(session.redo().is_none());
}

#[test]
fn test_undo_clears_redo_stack() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local\n",
        "=======\n",
        "remote\n",
        ">>>>>>> branch\n",
    );

    let (mut session, _path) = make_session(content, None);

    // Resolve -> undo creates redo entry
    let prev = session.resolve_conflict(1, splice_lib::parser::ConflictStatus::ResolvedWithLocal).unwrap();
    session.push_undo(splice_lib::parser::UndoEntry {
        description: "First".to_string(),
        statuses: vec![(1, prev)],
    });
    session.undo();
    assert_eq!(session.redo_stack.len(), 1);

    // New action clears redo
    let prev2 = session.resolve_conflict(1, splice_lib::parser::ConflictStatus::ResolvedWithRemote).unwrap();
    session.push_undo(splice_lib::parser::UndoEntry {
        description: "Second".to_string(),
        statuses: vec![(1, prev2)],
    });
    assert!(session.redo_stack.is_empty());
    assert_eq!(session.undo_stack.len(), 1);
}

// ── Magic Merge integration ──

#[test]
fn test_magic_merge_local_only_changed() {
    // Case: local != base, remote == base -> auto-resolve with local
    let content = concat!(
        "<<<<<<< HEAD\n",
        "new_value\n",
        "||||||| base\n",
        "old_value\n",
        "=======\n",
        "old_value\n",
        ">>>>>>> branch\n",
    );
    let (mut session, _path) = make_session(content, Some("old_value"));
    assert_eq!(session.total_count, 1);

    let conflict = session.conflict_mut(1).unwrap();
    let can_resolve = match (&conflict.base_lines, &conflict.local_lines, &conflict.remote_lines) {
        (Some(b), l, r) if l != b && r == b => true,
        _ => false,
    };
    assert!(can_resolve, "Should auto-resolve with local when only local changed");
}

#[test]
fn test_magic_merge_remote_only_changed() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "old_value\n",
        "||||||| base\n",
        "old_value\n",
        "=======\n",
        "new_remote\n",
        ">>>>>>> branch\n",
    );
    let (mut session, _path) = make_session(content, Some("old_value"));
    assert_eq!(session.total_count, 1);

    let conflict = session.conflict_mut(1).unwrap();
    let can_resolve = match (&conflict.base_lines, &conflict.local_lines, &conflict.remote_lines) {
        (Some(b), l, r) if l == b && r != b => true,
        _ => false,
    };
    assert!(can_resolve, "Should auto-resolve with remote when only remote changed");
}

#[test]
fn test_magic_merge_both_changed() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local_new\n",
        "||||||| base\n",
        "old_value\n",
        "=======\n",
        "remote_new\n",
        ">>>>>>> branch\n",
    );
    let (mut session, _path) = make_session(content, Some("old_value"));
    assert_eq!(session.total_count, 1);

    let conflict = session.conflict_mut(1).unwrap();
    let can_resolve = match (&conflict.base_lines, &conflict.local_lines, &conflict.remote_lines) {
        (Some(b), l, r) if l != b && r == b => true,
        (Some(b), l, r) if l == b && r != b => true,
        _ => false,
    };
    assert!(!can_resolve, "Should NOT auto-resolve when both sides changed");
}

// ── Content extraction ──

#[test]
fn test_extract_content_from_standard_format() {
    let content = concat!(
        "shared\n",
        "<<<<<<< HEAD\n",
        "l_change\n",
        "=======\n",
        "r_change\n",
        ">>>>>>> branch\n",
        "shared2\n",
    );

    let (session, _path) = make_session(content, None);
    assert!(session.all_local_content.contains("l_change"));
    assert!(!session.all_local_content.contains("r_change"));
    assert!(session.all_remote_content.contains("r_change"));
    assert!(!session.all_remote_content.contains("l_change"));
    assert!(session.all_local_content.contains("shared"));
    assert!(session.all_remote_content.contains("shared2"));
}

#[test]
fn test_extract_content_from_zdiff3() {
    let content = concat!(
        "a\n",
        "<<<<<<< HEAD\n",
        "l1\n",
        "||||||| base\n",
        "b1\n",
        "=======\n",
        "r1\n",
        ">>>>>>> branch\n",
        "z\n",
    );

    let local = splice_lib::parser::lexer::extract_local_content(content);
    let remote = splice_lib::parser::lexer::extract_remote_content(content);

    assert!(local.contains("l1"));
    assert!(!local.contains("r1"));
    assert!(remote.contains("r1"));
    assert!(!remote.contains("l1"));
    assert!(local.starts_with("a\n"));
    assert!(remote.starts_with("a\n"));
    assert!(local.ends_with("z\n"));
    assert!(remote.ends_with("z\n"));
}

#[test]
fn test_surrounding_content_preserved() {
    let content = concat!(
        "line1\n",
        "line2\n",
        "<<<<<<< HEAD\n",
        "conflict_local\n",
        "=======\n",
        "conflict_remote\n",
        ">>>>>>> branch\n",
        "line8\n",
        "line9\n",
    );

    let local = splice_lib::parser::lexer::extract_local_content(content);
    let remote = splice_lib::parser::lexer::extract_remote_content(content);

    assert!(local.starts_with("line1\nline2\n"), "local should start with line1/line2");
    assert!(remote.starts_with("line1\nline2\n"), "remote should start with line1/line2");
    assert!(local.ends_with("line8\nline9\n"), "local should end with line8/line9");
    assert!(remote.ends_with("line8\nline9\n"), "remote should end with line8/line9");
}

// ── Session with/without base ──

#[test]
fn test_session_without_base() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local\n",
        "=======\n",
        "remote\n",
        ">>>>>>> branch\n",
    );

    let (session, _path) = make_session(content, None);
    assert_eq!(session.total_count, 1);
    assert!(session.all_base_content.is_none());
}

#[test]
fn test_session_with_explicit_base() {
    let content = concat!(
        "<<<<<<< HEAD\n",
        "local\n",
        "=======\n",
        "remote\n",
        ">>>>>>> branch\n",
    );

    let (session, _path) = make_session(content, Some("base_content\n"));
    assert_eq!(session.total_count, 1);
    assert_eq!(session.all_base_content, Some("base_content\n".to_string()));
}

// We don't clean up temp files during tests to avoid races;
// they accumulate in /tmp/ but that's acceptable for dev tooling.
