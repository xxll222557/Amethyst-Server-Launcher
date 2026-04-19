use launcher_folder::{
    create_instance_directory as create_instance_directory_impl,
    export_text_file as export_text_file_impl,
    list_instance_files as list_instance_files_impl,
    read_instance_log_tail as read_instance_log_tail_impl,
    read_instance_text_file as read_instance_text_file_impl,
    write_instance_text_file as write_instance_text_file_impl,
    InstanceFileEntry,
};
use launcher_install::export_diagnostics_report as export_diagnostics_report_impl;
use launcher_launch::app::ProcessState;
use crate::backend_data_dir;

#[tauri::command]
pub fn read_instance_log_tail(instance_id: String, max_lines: Option<usize>) -> Result<Vec<String>, String> {
    let dir = backend_data_dir()?;
    read_instance_log_tail_impl(&dir, &instance_id, max_lines)
}

#[tauri::command]
pub fn list_instance_files(instance_id: String, relative_path: Option<String>) -> Result<Vec<InstanceFileEntry>, String> {
    let dir = backend_data_dir()?;
    list_instance_files_impl(&dir, &instance_id, relative_path)
}

#[tauri::command]
pub fn read_instance_text_file(instance_id: String, relative_path: String) -> Result<String, String> {
    let dir = backend_data_dir()?;
    read_instance_text_file_impl(&dir, &instance_id, &relative_path)
}

#[tauri::command]
pub fn write_instance_text_file(instance_id: String, relative_path: String, content: String) -> Result<(), String> {
    let dir = backend_data_dir()?;
    write_instance_text_file_impl(&dir, &instance_id, &relative_path, &content)
}

#[tauri::command]
pub fn create_instance_directory(instance_id: String, relative_path: String) -> Result<(), String> {
    let dir = backend_data_dir()?;
    create_instance_directory_impl(&dir, &instance_id, &relative_path)
}

#[tauri::command]
pub fn export_text_file(path: String, content: String) -> Result<(), String> {
    export_text_file_impl(path, content)
}

#[tauri::command]
pub fn export_diagnostics_report(
    process_state: tauri::State<ProcessState>,
    diagnostics_payload: Option<String>,
) -> Result<String, String> {
    let data_dir = backend_data_dir()?;
    export_diagnostics_report_impl(process_state.inner(), &data_dir, diagnostics_payload)
}
