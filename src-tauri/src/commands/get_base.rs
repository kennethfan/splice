/// Get the BASE (common ancestor) version of a file from Git.
/// This is useful when the conflict file doesn't have zdiff3 markers
/// and the BASE needs to be fetched from the repository.
#[tauri::command]
pub fn get_base_version(file_path: String) -> Result<Option<String>, String> {
    let repo_path = std::path::Path::new(&file_path)
        .parent()
        .ok_or_else(|| "Cannot determine parent directory".to_string())?;

    let repo = git2::Repository::open(repo_path)
        .map_err(|e| format!("Cannot open git repo: {}", e))?;

    // Check if we're in a merge
    let merge_head = match repo.find_reference("MERGE_HEAD") {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };

    let merge_commit = merge_head
        .peel_to_commit()
        .map_err(|e| format!("Cannot peel MERGE_HEAD: {}", e))?;

    let head = repo
        .head()
        .map_err(|e| format!("Cannot get HEAD: {}", e))?;

    let head_commit = head
        .peel_to_commit()
        .map_err(|e| format!("Cannot peel HEAD: {}", e))?;

    // Find merge base
    let base_oid = repo
        .merge_base(head_commit.id(), merge_commit.id())
        .map_err(|e| format!("Cannot find merge base: {}", e))?;

    let base_commit = repo
        .find_commit(base_oid)
        .map_err(|e| format!("Cannot find base commit: {}", e))?;

    let tree = base_commit
        .tree()
        .map_err(|e| format!("Cannot get base tree: {}", e))?;

    // Get relative path from repo root
    let workdir = repo.workdir().unwrap_or_else(|| std::path::Path::new("."));
    let abs_path = std::path::Path::new(&file_path);
    let relative = pathdiff::diff_paths(abs_path, workdir)
        .ok_or_else(|| "File is not inside the repository".to_string())?;

    let entry = tree
        .get_path(&relative)
        .map_err(|e| format!("Cannot find file in base commit: {}", e))?;

    let blob = repo
        .find_blob(entry.id())
        .map_err(|e| format!("Cannot find blob: {}", e))?;

    let content = String::from_utf8_lossy(blob.content()).to_string();

    Ok(Some(content))
}
