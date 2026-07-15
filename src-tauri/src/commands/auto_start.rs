use std::path::PathBuf;
use std::process::Command;
use serde::Serialize;

const HOOKS_DIR: &str = ".config/splice/hooks";
const HOOK_SCRIPT: &str = r#"#!/bin/bash
# Splice Conflict Hook
# Automatically opens Splice when git merge/rebase/cherry-pick conflicts are detected.
# Installed by Splice — remove with: splice-install.sh --uninstall or the Splice UI.

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || exit 0

# Only fire if a conflict operation is actually in progress
if [ ! -f "$GIT_DIR/MERGE_HEAD" ] && [ ! -f "$GIT_DIR/REBASE_HEAD" ] && [ ! -f "$GIT_DIR/CHERRY_PICK_HEAD" ]; then
    exit 0
fi

# Find unmerged (conflicted) files
UNMERGED=$(git diff --name-only --diff-filter=U 2>/dev/null)
if [ -z "$UNMERGED" ]; then
    exit 0
fi

# Count conflicted files
COUNT=$(echo "$UNMERGED" | wc -l | tr -d ' ')

# Don't launch if Splice is already running for this repo
if pgrep -x "splice" >/dev/null 2>&1; then
    exit 0
fi

# Launch Splice in the background with the first conflicted file
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
if [ -n "$REPO_ROOT" ]; then
    FIRST_FILE=$(echo "$UNMERGED" | head -1)
    nohup splice "$REPO_ROOT/$FIRST_FILE" >/dev/null 2>&1 &
fi
"#;

#[derive(Serialize)]
pub struct HookStatus {
    pub installed: bool,
    pub hooks_path: String,
    pub has_merge_hook: bool,
    pub has_commit_msg_hook: bool,
}

/// Install global git hooks that auto-launch Splice on merge/rebase conflicts.
///
/// Creates hooks in `~/.config/splice/hooks/` and sets
/// `git config --global core.hooksPath` to that directory.
#[tauri::command]
pub fn install_conflict_hook() -> Result<String, String> {
    let hooks_dir = get_hooks_dir()?;

    // Create the hooks directory
    std::fs::create_dir_all(&hooks_dir)
        .map_err(|e| format!("Failed to create hooks directory {}: {}", hooks_dir.display(), e))?;

    // Write the post-checkout hook
    let post_checkout = hooks_dir.join("post-checkout");
    std::fs::write(&post_checkout, HOOK_SCRIPT)
        .map_err(|e| format!("Failed to write post-checkout hook: {}", e))?;

    // Make hooks executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&post_checkout, perms)
            .map_err(|e| format!("Failed to chmod post-checkout: {}", e))?;
    }

    // Set core.hooksPath globally
    let hooks_path_str = hooks_dir.to_string_lossy().to_string();
    let output = Command::new("git")
        .args(["config", "--global", "core.hooksPath", &hooks_path_str])
        .output()
        .map_err(|e| format!("Failed to run git config: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git config core.hooksPath failed: {}", stderr.trim()));
    }

    Ok(hooks_path_str)
}

/// Remove the Splice conflict hooks and unset `core.hooksPath`.
#[tauri::command]
pub fn uninstall_conflict_hook() -> Result<(), String> {
    let hooks_dir = get_hooks_dir()?;

    // Remove hook file
    let post_checkout = hooks_dir.join("post-checkout");
    let _ = std::fs::remove_file(&post_checkout);

    // Remove the hooks directory if empty
    let _ = std::fs::remove_dir(&hooks_dir);

    // Try to remove the parent .config/splice/ directory too (ignore errors)
    if let Some(parent) = hooks_dir.parent() {
        let _ = std::fs::remove_dir(parent);
    }

    // Unset core.hooksPath globally
    let output = Command::new("git")
        .args(["config", "--global", "--unset", "core.hooksPath"])
        .output()
        .map_err(|e| format!("Failed to unset git config: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Don't error if the config didn't exist
        if !stderr.contains("does not have") {
            return Err(format!("Failed to unset core.hooksPath: {}", stderr.trim()));
        }
    }

    Ok(())
}

/// Check whether the Splice conflict hooks are installed.
#[tauri::command]
pub fn get_conflict_hook_status() -> HookStatus {
    let hooks_dir = match get_hooks_dir() {
        Ok(d) => d,
        Err(_) => {
            return HookStatus {
                installed: false,
                hooks_path: String::new(),
                has_merge_hook: false,
                has_commit_msg_hook: false,
            };
        }
    };

    let post_checkout = hooks_dir.join("post-checkout");
    let installed = post_checkout.exists();

    HookStatus {
        installed,
        hooks_path: hooks_dir.to_string_lossy().to_string(),
        has_merge_hook: installed,
        has_commit_msg_hook: false,
    }
}

fn get_hooks_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;
    Ok(PathBuf::from(home).join(HOOKS_DIR))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hooks_dir() {
        let dir = get_hooks_dir().unwrap();
        assert!(dir.to_string_lossy().contains(".config/splice/hooks"));
    }

    #[test]
    fn test_hook_script_contents() {
        assert!(HOOK_SCRIPT.contains("MERGE_HEAD"));
        assert!(HOOK_SCRIPT.contains("diff-filter=U"));
        assert!(HOOK_SCRIPT.contains("splice"));
    }

    #[test]
    fn test_hook_status_shape() {
        let status = get_conflict_hook_status();
        // Verify the struct has the expected fields
        assert!(!status.has_commit_msg_hook); // We no longer install this hook
        // has_merge_hook may be true/false depending on the test environment
        // hooks_path should either be empty or a path containing "splice/hooks"
        if !status.hooks_path.is_empty() {
            assert!(status.hooks_path.contains("splice/hooks"));
        }
    }
}
