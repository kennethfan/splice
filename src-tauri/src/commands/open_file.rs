use std::sync::Mutex;

use crate::parser;

/// Open a file with conflict markers and parse it into a MergeSession.
#[tauri::command]
pub fn open_file(
    path: String,
    state: tauri::State<'_, Mutex<Option<parser::MergeSession>>>,
) -> Result<parser::MergeSession, String> {
    // Read the file
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Parse conflicts
    let conflicts = parser::lexer::parse_conflicts(&content);

    // Extract full content for each version
    let all_local = parser::lexer::extract_local_content(&content);
    let all_remote = parser::lexer::extract_remote_content(&content);

    // Try to get BASE version (may fail if not in a git merge)
    let all_base = get_base_from_git(&path).ok().flatten();

    let session = parser::MergeSession::new(
        path,
        conflicts,
        all_local,
        all_remote,
        all_base,
    );

    // Store session in app state
    let mut guard = state.lock().map_err(|e| format!("State lock error: {}", e))?;
    *guard = Some(session.clone());

    Ok(session)
}

/// Try to get the BASE version of a file from Git's merge state.
fn get_base_from_git(file_path: &str) -> Result<Option<String>, String> {
    // Try to find the git repository containing this file
    let repo_path = std::path::Path::new(file_path).parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let repo = git2::Repository::open(repo_path)
        .map_err(|e| format!("Cannot open git repo: {}", e))?;

    // Check if we're in a merge state
    let merge_head = match repo.find_reference("MERGE_HEAD") {
        Ok(r) => r,
        Err(_) => return Ok(None), // Not in a merge - no BASE available
    };

    let merge_commit = merge_head.peel_to_commit()
        .map_err(|e| format!("Cannot peel MERGE_HEAD: {}", e))?;

    let head = repo.head()
        .map_err(|e| format!("Cannot get HEAD: {}", e))?;

    let head_commit = head.peel_to_commit()
        .map_err(|e| format!("Cannot peel HEAD: {}", e))?;

    // Find the merge base
    let base_oid = repo.merge_base(head_commit.id(), merge_commit.id())
        .map_err(|e| format!("Cannot find merge base: {}", e))?;

    // Get the file content from the base commit
    let base_commit = repo.find_commit(base_oid)
        .map_err(|e| format!("Cannot find base commit: {}", e))?;

    let tree = base_commit.tree()
        .map_err(|e| format!("Cannot get base tree: {}", e))?;

    // The file_path might be relative to repo root, or absolute
    let relative_path = get_relative_path(file_path, &repo);

    let entry = tree.get_path(std::path::Path::new(&relative_path))
        .map_err(|e| format!("Cannot find file in base tree: {}", e))?;

    let blob = repo.find_blob(entry.id())
        .map_err(|e| format!("Cannot find blob: {}", e))?;

    let content = String::from_utf8_lossy(blob.content()).to_string();

    Ok(Some(content))
}

/// Convert an absolute file path to a repo-relative path.
fn get_relative_path(absolute: &str, repo: &git2::Repository) -> String {
    let abs_path = std::path::Path::new(absolute);
    let workdir = repo.workdir().unwrap_or_else(|| std::path::Path::new("."));

    pathdiff::diff_paths(abs_path, workdir)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            // Fallback: just use the filename
            abs_path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_default()
        })
}
