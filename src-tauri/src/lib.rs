// Splice — Git Conflict Resolver

pub mod parser;
pub mod commands;
pub mod git;
pub mod diff;
pub mod watcher;

use std::collections::HashMap;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // If launched in mergetool mode, inject the file path into state
    let initial_sessions = if git::mergetool::is_mergetool_mode() {
        let mut map = HashMap::new();
        if let Some(path) = git::mergetool::get_mergetool_result_path() {
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    let conflicts = parser::lexer::parse_conflicts(&content);
                    let all_local = parser::lexer::extract_local_content(&content);
                    let all_remote = parser::lexer::extract_remote_content(&content);
                    let all_base = None;
                    let session = parser::MergeSession::new(
                        path.clone(),
                        conflicts,
                        all_local,
                        all_remote,
                        all_base,
                        content.clone(), // original content with markers
                    );
                    map.insert(path, session);
                }
                Err(e) => {
                    eprintln!("Splice: Failed to read {}: {}", path, e);
                }
            }
        }
        map
    } else {
        HashMap::new()
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(initial_sessions))
        .manage(Mutex::new(watcher::WatcherState::new()))
        .invoke_handler(tauri::generate_handler![
            commands::open_file::open_file,
            commands::resolve::resolve_conflict,
            commands::magic_merge::magic_merge,
            commands::save::save_file,
            commands::get_base::get_base_version,
            commands::close_session::close_session,
            commands::undo::undo,
            commands::undo::redo,
            commands::diff_cmd::compute_diffs,
            commands::configure_mergetool::configure_mergetool,
            commands::auto_start::install_conflict_hook,
            commands::auto_start::uninstall_conflict_hook,
            commands::auto_start::get_conflict_hook_status,
            commands::initial_session::get_initial_session,
            watcher::start_watcher,
            watcher::stop_watcher,
            watcher::add_watched_repo,
            watcher::remove_watched_repo,
            watcher::get_watcher_status,
            watcher::get_watched_repo_details,
            watcher::get_repo_conflicted_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
