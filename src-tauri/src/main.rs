// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Entry point for Splice.
///
/// In mergetool mode (--local, --remote, --result), parses the git arguments
/// and launches the Tauri GUI with the conflict file pre-loaded.
///
/// In normal mode, just launches the Tauri GUI.
fn main() {
    let args: Vec<String> = std::env::args().collect();

    // Check if we're being called as a git mergetool
    if let Some(mergetool_args) = splice_lib::git::mergetool::parse_args(&args) {
        // Set environment variables so the Tauri app can detect mergetool mode
        splice_lib::git::mergetool::set_mergetool_env(&mergetool_args);
        eprintln!("🔗 Splice: resolving conflicts in {}", mergetool_args.result.display());
    }

    // Launch the Tauri GUI (in both modes)
    splice_lib::run()
}
