// Splice — Git Conflict Resolver

pub mod parser;
pub mod commands;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(None::<parser::MergeSession>))
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
