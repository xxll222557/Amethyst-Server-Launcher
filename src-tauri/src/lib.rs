#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    launcher_runtime::tauri_app::build_tauri_app()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
