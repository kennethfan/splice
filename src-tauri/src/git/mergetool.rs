use std::path::PathBuf;

/// Arguments passed by `git mergetool`.
#[derive(Debug, Clone)]
pub struct MergetoolArgs {
    /// Path to the LOCAL version (current branch)
    pub local: PathBuf,
    /// Path to the BASE version (common ancestor)
    pub base: Option<PathBuf>,
    /// Path to the REMOTE version (incoming branch)
    pub remote: PathBuf,
    /// Path to the result file (where to write the resolved merge)
    pub result: PathBuf,
}

/// Parse mergetool command-line arguments.
///
/// Git calls mergetool with:
/// --local=<file> --base=<file> --remote=<file> --result=<file>
pub fn parse_args(args: &[String]) -> Option<MergetoolArgs> {
    let mut local: Option<PathBuf> = None;
    let mut base: Option<PathBuf> = None;
    let mut remote: Option<PathBuf> = None;
    let mut result: Option<PathBuf> = None;

    let mut i = 1; // Skip program name
    while i < args.len() {
        let arg = &args[i];
        if let Some(val) = arg.strip_prefix("--local=") {
            local = Some(PathBuf::from(val));
        } else if let Some(val) = arg.strip_prefix("--base=") {
            base = Some(PathBuf::from(val));
        } else if let Some(val) = arg.strip_prefix("--remote=") {
            remote = Some(PathBuf::from(val));
        } else if let Some(val) = arg.strip_prefix("--result=") {
            result = Some(PathBuf::from(val));
        }
        i += 1;
    }

    // --local, --remote, and --result are required
    match (local, remote, result) {
        (Some(l), Some(r), Some(res)) => Some(MergetoolArgs {
            local: l,
            base,
            remote: r,
            result: res,
        }),
        _ => None,
    }
}

/// Set environment variables for the Tauri app to detect mergetool mode.
pub fn set_mergetool_env(args: &MergetoolArgs) {
    std::env::set_var("SPLICE_MERGETOOL", "1");
    std::env::set_var("SPLICE_MERGETOOL_RESULT", args.result.to_string_lossy().as_ref());
    std::env::set_var("SPLICE_MERGETOOL_LOCAL", args.local.to_string_lossy().as_ref());
    if let Some(base) = &args.base {
        std::env::set_var("SPLICE_MERGETOOL_BASE", base.to_string_lossy().as_ref());
    }
    std::env::set_var("SPLICE_MERGETOOL_REMOTE", args.remote.to_string_lossy().as_ref());
}

/// Check if the app was launched in mergetool mode.
pub fn is_mergetool_mode() -> bool {
    std::env::var("SPLICE_MERGETOOL").as_deref() == Ok("1")
}

/// Get the result file path from the environment.
pub fn get_mergetool_result_path() -> Option<String> {
    std::env::var("SPLICE_MERGETOOL_RESULT").ok()
}

/// Generate the git config snippet for setting up Splice as a mergetool.
pub fn generate_setup_script() -> String {
    r#"# Configure Splice as your Git mergetool:
git config --global merge.conflictStyle zdiff3
git config --global mergetool.splice.cmd 'splice --local="$LOCAL" --base="$BASE" --remote="$REMOTE" --result="$MERGED"'
git config --global mergetool.splice.trustExitCode true
git config --global merge.tool splice
echo "✅ Splice is now your default mergetool""#
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_full_args() {
        let args = vec![
            "splice".to_string(),
            "--local=/tmp/local.js".to_string(),
            "--base=/tmp/base.js".to_string(),
            "--remote=/tmp/remote.js".to_string(),
            "--result=/tmp/result.js".to_string(),
        ];
        let parsed = parse_args(&args).unwrap();
        assert_eq!(parsed.local.to_string_lossy(), "/tmp/local.js");
        assert_eq!(parsed.base.unwrap().to_string_lossy(), "/tmp/base.js");
        assert_eq!(parsed.remote.to_string_lossy(), "/tmp/remote.js");
        assert_eq!(parsed.result.to_string_lossy(), "/tmp/result.js");
    }

    #[test]
    fn test_parse_minimal_args() {
        let args = vec![
            "splice".to_string(),
            "--local=a.txt".to_string(),
            "--remote=b.txt".to_string(),
            "--result=c.txt".to_string(),
        ];
        let parsed = parse_args(&args).unwrap();
        assert!(parsed.base.is_none());
    }

    #[test]
    fn test_parse_missing_required() {
        // Missing --result
        let args = vec![
            "splice".to_string(),
            "--local=a.txt".to_string(),
            "--remote=b.txt".to_string(),
        ];
        assert!(parse_args(&args).is_none());

        // Empty args
        assert!(parse_args(&[]).is_none());
    }

    #[test]
    fn test_setup_script() {
        let script = generate_setup_script();
        assert!(script.contains("merge.tool splice"));
        assert!(script.contains("mergetool.splice.cmd"));
    }

    #[test]
    fn test_env_var_roundtrip() {
        let args = MergetoolArgs {
            local: "/tmp/a".into(),
            base: Some("/tmp/b".into()),
            remote: "/tmp/c".into(),
            result: "/tmp/d".into(),
        };
        set_mergetool_env(&args);
        assert!(is_mergetool_mode());
        assert_eq!(get_mergetool_result_path(), Some("/tmp/d".to_string()));
    }
}
