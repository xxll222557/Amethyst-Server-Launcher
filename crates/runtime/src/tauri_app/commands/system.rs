use launcher_monitor::{collect_system_resources, SystemResourceSnapshot};

#[tauri::command]
pub fn get_system_resources() -> SystemResourceSnapshot {
    collect_system_resources()
}
