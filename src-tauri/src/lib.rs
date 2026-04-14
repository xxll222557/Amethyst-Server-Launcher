// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use launcher_data::{create_instance, list_instances, CreateInstanceRequest, InstanceConfig};
use launcher_launch::{start_instance, LaunchResult};
use launcher_monitor::{collect_system_resources, SystemResourceSnapshot};

fn backend_data_dir() -> Result<std::path::PathBuf, String> {
    let root = std::env::current_dir().map_err(|err| format!("failed to resolve current dir: {err}"))?;
    Ok(root.join(".launcher-data"))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_system_resources() -> SystemResourceSnapshot {
    collect_system_resources()
}

#[tauri::command]
fn get_instances() -> Result<Vec<InstanceConfig>, String> {
    let dir = backend_data_dir()?;
    list_instances(&dir)
}

#[tauri::command]
fn create_instance_config(request: CreateInstanceRequest) -> Result<InstanceConfig, String> {
    let dir = backend_data_dir()?;
    create_instance(&dir, request)
}

#[tauri::command]
fn start_instance_server(instance_id: String) -> Result<LaunchResult, String> {
    let dir = backend_data_dir()?;
    let instances = list_instances(&dir)?;
    let instance = instances
        .iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| format!("instance not found: {instance_id}"))?;

    start_instance(instance)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::{WebviewUrl, WebviewWindowBuilder};

            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("server-launcher")
                .inner_size(1366.0, 840.0)
                .min_inner_size(1180.0, 760.0);

            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;

                let builder = builder.title_bar_style(TitleBarStyle::Transparent);

                let window = builder.build().expect("failed to build main window");

                use cocoa::appkit::{NSColor, NSWindow};
                use cocoa::base::{id, nil};

                let ns_window = window.ns_window().expect("missing native window") as id;
                unsafe {
                    let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                        nil,
                        50.0 / 255.0,
                        158.0 / 255.0,
                        163.5 / 255.0,
                        1.0,
                    );
                    ns_window.setBackgroundColor_(bg_color);
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                let builder = builder.decorations(false);
                let _window = builder.build().expect("failed to build main window");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_system_resources,
            get_instances,
            create_instance_config,
            start_instance_server
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
