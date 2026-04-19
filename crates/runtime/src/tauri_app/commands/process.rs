use launcher_data::get_instance;
use launcher_launch::{
    app::{
        get_instance_console_logs as get_instance_console_logs_impl,
        send_instance_command as send_instance_command_impl,
        start_instance_server_managed,
        stop_instance_process as stop_instance_process_impl,
        InstanceConsoleLogEvent,
        InstanceProcessEvent,
        ProcessState,
    },
    LaunchResult,
};
use crate::backend_data_dir;
use std::sync::Arc;
use tauri::Emitter;

#[tauri::command]
pub fn get_instance_console_logs(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
    max_lines: Option<usize>,
) -> Result<Vec<String>, String> {
    get_instance_console_logs_impl(process_state.inner(), &instance_id, max_lines)
}

#[tauri::command]
pub fn start_instance_server(
    app: tauri::AppHandle,
    process_state: tauri::State<ProcessState>,
    instance_id: String,
) -> Result<LaunchResult, String> {
    let dir = backend_data_dir()?;
    let instance = get_instance(&dir, &instance_id)?;

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
pub fn send_instance_command(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
    command: String,
) -> Result<(), String> {
    send_instance_command_impl(process_state.inner(), &instance_id, &command)
}

#[tauri::command]
pub fn stop_instance_process(process_state: tauri::State<ProcessState>, instance_id: String) -> Result<(), String> {
    stop_instance_process_impl(process_state.inner(), &instance_id)
}
