use std::process::Command;

/// Configure Splice as the global git mergetool.
///
/// Runs `git config --global` to set:
///   - merge.conflictStyle = zdiff3
///   - merge.tool = splice
///   - mergetool.splice.cmd = <current_exe> --local="$LOCAL" --base="$BASE" --remote="$REMOTE" --result="$MERGED"
///   - mergetool.splice.trustExitCode = true
#[tauri::command]
pub fn configure_mergetool() -> Result<String, String> {
    // Get the path to the currently running Splice binary
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Failed to get Splice binary path: {}", e))?;
    let exe_path = current_exe.to_string_lossy().to_string();

    // Build the mergetool command with absolute path and git variable substitution
    let cmd = format!(
        "\"{}\" --local=\"$LOCAL\" --base=\"$BASE\" --remote=\"$REMOTE\" --result=\"$MERGED\"",
        exe_path
    );

    // Run git config commands
    run_git_config("merge.conflictStyle", "zdiff3")?;
    run_git_config("merge.tool", "splice")?;
    run_git_config("mergetool.splice.cmd", &cmd)?;
    run_git_config("mergetool.splice.trustExitCode", "true")?;

    Ok(cmd)
}

fn run_git_config(key: &str, value: &str) -> Result<(), String> {
    let output = Command::new("git")
        .args(["config", "--global", key, value])
        .output()
        .map_err(|e| format!("Failed to run git config: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git config {} failed: {}", key, stderr.trim()));
    }

    Ok(())
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_cmd_format() {
        let cmd = format!(
            "\"{}\" --local=\"$LOCAL\" --base=\"$BASE\" --remote=\"$REMOTE\" --result=\"$MERGED\"",
            "/usr/local/bin/splice"
        );
        assert!(cmd.contains("\"/usr/local/bin/splice\""));
        assert!(cmd.contains("--local=\"$LOCAL\""));
        assert!(cmd.contains("--base=\"$BASE\""));
        assert!(cmd.contains("--remote=\"$REMOTE\""));
        assert!(cmd.contains("--result=\"$MERGED\""));
    }
}
