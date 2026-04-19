use launcher_data::{
    create_instance, list_instances, update_instance_java_path, CreateInstanceRequest, InstanceConfig,
};
use launcher_launch::app::{
    check_instance_preflight as check_instance_preflight_impl,
    delete_instance_with_process_cleanup,
    get_instance_java_runtime_status as get_instance_java_runtime_status_impl,
    get_instance_process_status as get_instance_process_status_impl,
    InstanceJavaRuntimeStatus,
    InstancePreflightReport,
    InstanceProcessStatus,
    ProcessState,
};
use crate::backend_data_dir;

#[tauri::command]
pub fn get_instances() -> Result<Vec<InstanceConfig>, String> {
    let dir = backend_data_dir()?;
    list_instances(&dir)
}

#[tauri::command]
pub fn create_instance_config(request: CreateInstanceRequest) -> Result<InstanceConfig, String> {
    let dir = backend_data_dir()?;
    create_instance(&dir, request)
}

#[tauri::command]
pub fn update_instance_java_path_command(
    instance_id: String,
    java_path: Option<String>,
) -> Result<InstanceConfig, String> {
    let dir = backend_data_dir()?;
    update_instance_java_path(&dir, &instance_id, java_path)
}

#[tauri::command]
pub fn delete_instance_command(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
) -> Result<(), String> {
    let dir = backend_data_dir()?;
    delete_instance_with_process_cleanup(process_state.inner(), &dir, &instance_id)
}

#[tauri::command]
pub fn get_instance_java_runtime_status(instance_id: String) -> Result<InstanceJavaRuntimeStatus, String> {
    let dir = backend_data_dir()?;
    get_instance_java_runtime_status_impl(&dir, &instance_id)
}

#[tauri::command]
pub fn get_instance_process_status(
    process_state: tauri::State<ProcessState>,
    instance_id: String,
) -> Result<InstanceProcessStatus, String> {
    get_instance_process_status_impl(process_state.inner(), &instance_id)
}

#[tauri::command]
pub fn check_instance_preflight(instance_id: String) -> Result<InstancePreflightReport, String> {
    let dir = backend_data_dir()?;
    check_instance_preflight_impl(&dir, &instance_id)
}
