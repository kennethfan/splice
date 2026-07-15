// Splice Conflict Watcher Daemon
//
// Background thread that periodically polls watched git repositories for
// merge/rebase/cherry-pick conflicts and emits Tauri events to the frontend.

use std::path::PathBuf;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Payload sent to the frontend when conflicts are detected.
#[derive(Clone, Serialize, Deserialize)]
pub struct ConflictDetectedPayload {
    pub repo_root: String,
    pub file_path: String,
    pub conflict_count: usize,
    pub all_files: Vec<String>,
}

/// Payload sent when all conflicts in a repo have been resolved.
#[derive(Clone, Serialize, Deserialize)]
pub struct ConflictsResolvedPayload {
    pub repo_root: String,
}

/// Status payload sent when watcher state changes.
#[derive(Clone, Serialize, Deserialize)]
pub struct WatcherStatusPayload {
    pub running: bool,
    pub watched_repos: Vec<String>,
    pub poll_interval_secs: u64,
}

/// Detail for a single watched repository.
#[derive(Clone, Serialize, Deserialize)]
pub struct WatchedRepoDetail {
    pub path: String,
    pub name: String,
    pub has_conflicts: bool,
    pub has_merge_op: bool,
}

/// Response from get_watched_repo_details.
#[derive(Clone, Serialize, Deserialize)]
pub struct WatchedRepoDetailsPayload {
    pub running: bool,
    pub repos: Vec<WatchedRepoDetail>,
}

/// Thread-safe state for the conflict watcher daemon.
pub struct WatcherState {
    pub running: Arc<AtomicBool>,
    pub watched_repos: Arc<Mutex<Vec<String>>>,
    /// Tracks which repos already had their conflicts notified to avoid re-emit.
    pub notified_conflicts: Arc<Mutex<Vec<String>>>,
    pub poll_interval_secs: u64,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            watched_repos: Arc::new(Mutex::new(Vec::new())),
            notified_conflicts: Arc::new(Mutex::new(Vec::new())),
            poll_interval_secs: 5,
        }
    }
}

/// Start the conflict watcher daemon in a background thread.
///
/// The daemon polls all watched repos every `poll_interval_secs` and emits
/// `conflict-detected` / `conflicts-resolved` events via the Tauri event system.
#[tauri::command]
pub fn start_watcher(
    app_handle: AppHandle,
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<WatcherStatusPayload, String> {
    {
        let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;

        if watcher.running.load(Ordering::SeqCst) {
            return Err("Watcher is already running".into());
        }

        watcher.running.store(true, Ordering::SeqCst);
    }

    // Clone Arcs outside the lock to avoid deadlock in capture
    let running = {
        let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        watcher.running.clone()
    };
    let repos = {
        let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        watcher.watched_repos.clone()
    };
    let notified = {
        let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        watcher.notified_conflicts.clone()
    };
    let interval = 5;

    // Spawn the polling thread
    thread::spawn(move || {
        poll_loop(app_handle, running, repos, notified, interval);
    });

    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(watcher_status_from_state(&watcher))
}

/// Stop the conflict watcher daemon.
#[tauri::command]
pub fn stop_watcher(
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<WatcherStatusPayload, String> {
    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    watcher.running.store(false, Ordering::SeqCst);
    Ok(watcher_status_from_state(&watcher))
}

/// Add a directory to the watch list. The directory should be a git repository root.
#[tauri::command]
pub fn add_watched_repo(
    path: String,
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<WatcherStatusPayload, String> {
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Invalid path '{}': {}", path, e))?;
    let canonical_str = canonical.to_string_lossy().to_string();

    // Verify it's a git repo
    let git_dir = canonical.join(".git");
    if !git_dir.exists() || !git_dir.is_dir() {
        return Err(format!("'{}' is not a git repository", canonical_str));
    }

    // Avoid duplicates
    {
        let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut repos = watcher.watched_repos.lock().map_err(|e| format!("Lock error: {}", e))?;
        if !repos.contains(&canonical_str) {
            repos.push(canonical_str);
        }
    }

    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(watcher_status_from_state(&watcher))
}

/// Remove a directory from the watch list.
#[tauri::command]
pub fn remove_watched_repo(
    path: String,
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<WatcherStatusPayload, String> {
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Invalid path '{}': {}", path, e))?;
    let canonical_str = canonical.to_string_lossy().to_string();

    {
        let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut repos = watcher.watched_repos.lock().map_err(|e| format!("Lock error: {}", e))?;
        repos.retain(|r| r != &canonical_str);
        let mut notified = watcher.notified_conflicts.lock().map_err(|e| format!("Lock error: {}", e))?;
        notified.retain(|r| r != &canonical_str);
    }

    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(watcher_status_from_state(&watcher))
}

/// Get the current watcher status.
#[tauri::command]
pub fn get_watcher_status(
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<WatcherStatusPayload, String> {
    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(watcher_status_from_state(&watcher))
}

/// Get detailed info about each watched repository.
#[tauri::command]
pub fn get_watched_repo_details(
    state: tauri::State<'_, Mutex<WatcherState>>,
) -> Result<WatchedRepoDetailsPayload, String> {
    let watcher = state.lock().map_err(|e| format!("Lock error: {}", e))?;
    let repos = watcher.watched_repos.lock()
        .map(|r| r.clone())
        .unwrap_or_default();
    let notified = watcher.notified_conflicts.lock()
        .map(|n| n.clone())
        .unwrap_or_default();
    let running = watcher.running.load(Ordering::SeqCst);

    let details: Vec<WatchedRepoDetail> = repos.into_iter().map(|path| {
        let name = std::path::Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());

        let git_dir = std::path::Path::new(&path).join(".git");
        let has_merge_head = git_dir.join("MERGE_HEAD").exists();
        let has_rebase_head = git_dir.join("REBASE_HEAD").exists();
        let has_cherry_pick_head = git_dir.join("CHERRY_PICK_HEAD").exists();
        let has_merge_op = has_merge_head || has_rebase_head || has_cherry_pick_head;

        let has_conflicts = notified.contains(&path);

        WatchedRepoDetail {
            path,
            name,
            has_conflicts,
            has_merge_op,
        }
    }).collect();

    Ok(WatchedRepoDetailsPayload { running, repos: details })
}

/// Get the list of unmerged/conflicted files in a watched repository.
/// Returns the files as absolute paths.
#[tauri::command]
pub fn get_repo_conflicted_files(
    path: String,
) -> Result<Vec<String>, String> {
    let canonical = std::fs::canonicalize(&path)
        .map_err(|e| format!("Invalid path '{}': {}", path, e))?;
    let repo_root = canonical.to_string_lossy().to_string();

    let relative_files = get_unmerged_files(&repo_root);
    if relative_files.is_empty() {
        return Ok(Vec::new());
    }

    let absolute: Vec<String> = relative_files.into_iter().map(|f| {
        if f.starts_with('/') {
            f
        } else {
            canonical.join(&f).to_string_lossy().to_string()
        }
    }).collect();

    Ok(absolute)
}

fn watcher_status_from_state(watcher: &WatcherState) -> WatcherStatusPayload {
    WatcherStatusPayload {
        running: watcher.running.load(Ordering::SeqCst),
        watched_repos: watcher.watched_repos.lock()
            .map(|r| r.clone())
            .unwrap_or_default(),
        poll_interval_secs: watcher.poll_interval_secs,
    }
}

/// The main polling loop that runs on a background thread.
fn poll_loop(
    app_handle: AppHandle,
    running: Arc<AtomicBool>,
    repos: Arc<Mutex<Vec<String>>>,
    notified: Arc<Mutex<Vec<String>>>,
    interval_secs: u64,
) {
    while running.load(Ordering::SeqCst) {
        let repo_list = repos.lock()
            .map(|r| r.clone())
            .unwrap_or_default();

        for repo in &repo_list {
            if !running.load(Ordering::SeqCst) {
                return;
            }

            check_repo_for_conflicts(&app_handle, repo, &notified);
        }

        // Sleep for the poll interval
        thread::sleep(Duration::from_secs(interval_secs));
    }
}

/// Check a single repository for merge conflicts and emit events accordingly.
fn check_repo_for_conflicts(
    app_handle: &AppHandle,
    repo_path: &str,
    notified: &Arc<Mutex<Vec<String>>>,
) {
    let repo = PathBuf::from(repo_path);
    let git_dir = repo.join(".git");

    // Quick check: look for merge/rebase/cherry-pick HEAD files
    let has_merge_head = git_dir.join("MERGE_HEAD").exists();
    let has_rebase_head = git_dir.join("REBASE_HEAD").exists();
    let has_cherry_pick_head = git_dir.join("CHERRY_PICK_HEAD").exists();

    if !has_merge_head && !has_rebase_head && !has_cherry_pick_head {
        // No conflict operation in progress — if we had notified before, mark resolved
        let mut notified_list = notified.lock().unwrap();
        if notified_list.contains(&repo_path.to_string()) {
            let _ = app_handle.emit("conflicts-resolved", ConflictsResolvedPayload {
                repo_root: repo_path.to_string(),
            });
            notified_list.retain(|r| r != repo_path);
        }
        return;
    }

    // Check for unmerged files
    let unmerged = get_unmerged_files(repo_path);
    if unmerged.is_empty() {
        return;
    }

    let first_file = unmerged[0].clone();
    let full_path = if first_file.starts_with('/') {
        first_file.clone()
    } else {
        repo.join(&first_file).to_string_lossy().to_string()
    };
    let conflict_count = unmerged.len();

    // Only emit if we haven't already notified for this repo
    let mut notified_list = notified.lock().unwrap();
    if !notified_list.contains(&repo_path.to_string()) {
        let _ = app_handle.emit("conflict-detected", ConflictDetectedPayload {
            repo_root: repo_path.to_string(),
            file_path: full_path,
            conflict_count,
            all_files: unmerged,
        });
        notified_list.push(repo_path.to_string());
    }
}

/// Run `git diff --name-only --diff-filter=U` in the given repo directory.
fn get_unmerged_files(repo_path: &str) -> Vec<String> {
    let output = Command::new("git")
        .args(["-C", repo_path, "diff", "--name-only", "--diff-filter=U"])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watcher_state_new() {
        let state = WatcherState::new();
        assert!(!state.running.load(Ordering::SeqCst));
        assert!(state.watched_repos.lock().unwrap().is_empty());
        assert!(state.notified_conflicts.lock().unwrap().is_empty());
        assert_eq!(state.poll_interval_secs, 5);
    }

    #[test]
    fn test_watcher_status_payload() {
        let state = WatcherState::new();
        let status = watcher_status_from_state(&state);
        assert!(!status.running);
        assert!(status.watched_repos.is_empty());
        assert_eq!(status.poll_interval_secs, 5);
    }

    #[test]
    fn test_get_unmerged_files_no_repo() {
        // Should return empty vec for a non-existent directory
        let files = get_unmerged_files("/tmp/nonexistent-splice-test-repo-12345");
        assert!(files.is_empty());
    }
}
