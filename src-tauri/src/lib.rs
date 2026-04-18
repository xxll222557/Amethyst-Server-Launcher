// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use launcher_data::{
    create_instance, list_instances, update_instance_java_path, CreateInstanceRequest, InstanceConfig,
};
use launcher_download::{
    download_java_runtime_with_progress, download_server_core_with_progress, DownloadResult,
};
use launcher_launch::LaunchResult;
use launcher_monitor::{collect_system_resources, SystemResourceSnapshot};
use launcher_runtime::{
    backend_data_dir, check_instance_preflight as check_instance_preflight_impl,
    create_instance_directory as create_instance_directory_impl,
    delete_instance_with_process_cleanup, export_diagnostics_report as export_diagnostics_report_impl,
    export_text_file as export_text_file_impl, get_instance_console_logs as get_instance_console_logs_impl,
    get_instance_java_runtime_status as get_instance_java_runtime_status_impl,
    get_instance_process_status as get_instance_process_status_impl,
    list_instance_files as list_instance_files_impl, read_instance_log_tail as read_instance_log_tail_impl,
    read_instance_text_file as read_instance_text_file_impl, resolve_instance,
    send_instance_command as send_instance_command_impl,
    start_instance_server_managed, stop_instance_process as stop_instance_process_impl,
    write_instance_text_file as write_instance_text_file_impl, InstanceConsoleLogEvent,
    InstanceFileEntry, InstanceJavaRuntimeStatus, InstancePreflightReport, InstanceProcessEvent,
    InstanceProcessStatus, ProcessState,
};
use std::path::Path;
use std::sync::Arc;
use tauri::Emitter;

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
fn update_instance_java_path_command(
    instance_id: String,
    java_path: Option<String>,
) -> Result<InstanceConfig, String> {
    let dir = backend_data_dir()?;
    update_instance_java_path(&dir, &instance_id, java_path)
}

#[tauri::command]
fn delete_instance_command(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
) -> Result<(), String> {
    let dir = backend_data_dir()?;
    delete_instance_with_process_cleanup(process_state.inner(), &dir, &instance_id)
}

#[tauri::command]
fn get_instance_java_runtime_status(instance_id: String) -> Result<InstanceJavaRuntimeStatus, String> {
    let dir = backend_data_dir()?;
    get_instance_java_runtime_status_impl(&dir, &instance_id)
}

#[tauri::command]
fn get_instance_process_status(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
) -> Result<InstanceProcessStatus, String> {
    get_instance_process_status_impl(process_state.inner(), &instance_id)
}

#[tauri::command]
fn check_instance_preflight(instance_id: String) -> Result<InstancePreflightReport, String> {
    let dir = backend_data_dir()?;
    check_instance_preflight_impl(&dir, &instance_id)
}

#[tauri::command]
fn get_instance_console_logs(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
    max_lines: Option<usize>,
) -> Result<Vec<String>, String> {
    get_instance_console_logs_impl(process_state.inner(), &instance_id, max_lines)
}

#[tauri::command]
fn start_instance_server(
    app: tauri::AppHandle,
    process_state: tauri::State<ProcessState>,
    instance_id: String,
) -> Result<LaunchResult, String> {
    let dir = backend_data_dir()?;
    let instance = resolve_instance(&dir, &instance_id)?;

    let app_for_log = app.clone();
    let log_emitter = Arc::new(move |event: InstanceConsoleLogEvent| {
        let _ = app_for_log.emit("instance-console-log", &event);
    });

    let app_for_state = app;
    let state_emitter = Arc::new(move |event: InstanceProcessEvent| {
        let _ = app_for_state.emit("instance-process-state", &event);
    });

    start_instance_server_managed(
        process_state.inner(),
        &instance,
        log_emitter,
        state_emitter,
    )
}

#[tauri::command]
async fn download_instance_java_runtime(
    app: tauri::AppHandle,
    instance_id: String,
) -> Result<String, String> {
    let dir = backend_data_dir()?;
    let instance = resolve_instance(&dir, &instance_id)?;

    let app_handle = app.clone();
    let java_exec = tauri::async_runtime::spawn_blocking(move || {
        download_java_runtime_with_progress(
            &instance.id,
            Path::new(&instance.directory),
            &instance.version,
            |progress| {
                let _ = app_handle.emit("instance-download-progress", &progress);
            },
        )
    })
    .await
    .map_err(|err| format!("java download task join error: {err}"))??;

    let java_path = java_exec.to_string_lossy().to_string();
    let _ = update_instance_java_path(&dir, &instance_id, Some(java_path.clone()));
    Ok(java_path)
}

#[tauri::command]
fn send_instance_command(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
    command: String,
) -> Result<(), String> {
    send_instance_command_impl(process_state.inner(), &instance_id, &command)
}

#[tauri::command]
fn stop_instance_process(process_state: tauri::State<ProcessState>, instance_id: String) -> Result<(), String> {
    stop_instance_process_impl(process_state.inner(), &instance_id)
}

#[tauri::command]
async fn download_instance_core(
    app: tauri::AppHandle,
    instance_id: String,
    include_java: bool,
) -> Result<DownloadResult, String> {
    let dir = backend_data_dir()?;
    let instance = resolve_instance(&dir, &instance_id)?;

    let app_handle = app.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        download_server_core_with_progress(
            &instance.id,
            std::path::Path::new(&instance.directory),
            &instance.server_type,
            &instance.version,
            include_java,
            |progress| {
                let _ = app_handle.emit("instance-download-progress", &progress);
            },
        )
    })
    .await
    .map_err(|err| format!("download task join error: {err}"))??;

    if let Some(java_path) = result.java_executable_path.clone() {
        let _ = update_instance_java_path(&dir, &instance_id, Some(java_path));
    }

    Ok(result)
}

#[tauri::command]
fn read_instance_log_tail(instance_id: String, max_lines: Option<usize>) -> Result<Vec<String>, String> {
    let dir = backend_data_dir()?;
    read_instance_log_tail_impl(&dir, &instance_id, max_lines)
}

#[tauri::command]
fn list_instance_files(instance_id: String, relative_path: Option<String>) -> Result<Vec<InstanceFileEntry>, String> {
    let dir = backend_data_dir()?;
    list_instance_files_impl(&dir, &instance_id, relative_path)
}

#[tauri::command]
fn read_instance_text_file(instance_id: String, relative_path: String) -> Result<String, String> {
    let dir = backend_data_dir()?;
    read_instance_text_file_impl(&dir, &instance_id, &relative_path)
}

#[tauri::command]
fn write_instance_text_file(instance_id: String, relative_path: String, content: String) -> Result<(), String> {
    let dir = backend_data_dir()?;
    write_instance_text_file_impl(&dir, &instance_id, &relative_path, &content)
}

#[tauri::command]
fn create_instance_directory(instance_id: String, relative_path: String) -> Result<(), String> {
    let dir = backend_data_dir()?;
    create_instance_directory_impl(&dir, &instance_id, &relative_path)
}

#[tauri::command]
fn export_text_file(path: String, content: String) -> Result<(), String> {
    export_text_file_impl(path, content)
}

#[tauri::command]
fn export_diagnostics_report(
    process_state: tauri::State<ProcessState>,
    diagnostics_payload: Option<String>,
) -> Result<String, String> {
    let data_dir = backend_data_dir()?;
    export_diagnostics_report_impl(process_state.inner(), &data_dir, diagnostics_payload)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProcessState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            update_instance_java_path_command,
            delete_instance_command,
            get_instance_java_runtime_status,
            get_instance_process_status,
            check_instance_preflight,
            get_instance_console_logs,
            start_instance_server,
            download_instance_java_runtime,
            send_instance_command,
            stop_instance_process,
            download_instance_core,
            read_instance_log_tail,
            list_instance_files,
            read_instance_text_file,
            write_instance_text_file,
            create_instance_directory,
            export_text_file,
            export_diagnostics_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
