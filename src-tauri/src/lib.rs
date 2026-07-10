// Splice — Git Conflict Resolver

pub mod parser;
pub mod commands;
pub mod git;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // If launched in mergetool mode, inject the file path into state
    let initial_session = if git::mergetool::is_mergetool_mode() {
        git::mergetool::get_mergetool_result_path().and_then(|path| {
            // Auto-open the result file
            match std::fs::read_to_string(&path) {
                Ok(content) => {
                    let conflicts = parser::lexer::parse_conflicts(&content);
                    let all_local = parser::lexer::extract_local_content(&content);
                    let all_remote = parser::lexer::extract_remote_content(&content);
                    let all_base = None; // Will be fetched lazily if needed
                    Some(parser::MergeSession::new(
                        path,
                        conflicts,
                        all_local,
                        all_remote,
                        all_base,
                    ))
                }
                Err(e) => {
                    eprintln!("Splice: Failed to read {}: {}", path, e);
                    None
                }
            }
        })
    } else {
        None
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(initial_session))
        .invoke_handler(tauri::generate_handler![
            commands::open_file::open_file,
            commands::resolve::resolve_conflict,
            commands::magic_merge::magic_merge,
            commands::save::save_file,
            commands::get_base::get_base_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
