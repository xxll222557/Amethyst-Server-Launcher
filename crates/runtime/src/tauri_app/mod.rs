mod commands;

use launcher_launch::app::ProcessState;

pub fn build_tauri_app() -> tauri::Builder<tauri::Wry> {
    tauri::Builder::default()
        .manage(ProcessState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::{WebviewUrl, WebviewWindowBuilder};

            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("server-launcher")
                .inner_size(1280.0, 760.0)
                .min_inner_size(1180.0, 680.0);

            #[cfg(target_os = "macos")]
            {
                use tauri::{LogicalPosition, TitleBarStyle};

                let builder = builder
                    .title_bar_style(TitleBarStyle::Overlay)
                    .hidden_title(true)
                    .traffic_light_position(LogicalPosition::new(24.0, 20.0));
                let _window = builder.build().expect("failed to build main window");
            }

            #[cfg(not(target_os = "macos"))]
            {
                let builder = builder.decorations(false);
                let _window = builder.build().expect("failed to build main window");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::get_system_resources,
            commands::instances::get_instances,
            commands::instances::create_instance_config,
            commands::instances::update_instance_java_path_command,
            commands::instances::delete_instance_command,
            commands::instances::get_instance_java_runtime_status,
            commands::instances::get_instance_process_status,
            commands::instances::check_instance_preflight,
            commands::process::get_instance_console_logs,
            commands::process::start_instance_server,
            commands::downloads::download_instance_java_runtime,
            commands::process::send_instance_command,
            commands::process::stop_instance_process,
            commands::downloads::download_instance_core,
            commands::downloads::download_market_asset,
            commands::files::read_instance_log_tail,
            commands::files::list_instance_files,
            commands::files::read_instance_text_file,
            commands::files::write_instance_text_file,
            commands::files::create_instance_directory,
            commands::files::export_text_file,
            commands::files::export_diagnostics_report
        ])
}
