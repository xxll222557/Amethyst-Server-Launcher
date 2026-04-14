use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourceSnapshot {
    cpu_usage: f32,
    memory_used: u64,
    memory_total: u64,
    disk_used: u64,
    disk_total: u64,
    timestamp: u64,
}

pub fn collect_system_resources() -> SystemResourceSnapshot {
    use std::time::{SystemTime, UNIX_EPOCH};
    use sysinfo::{Disks, System};

    let mut system = System::new_all();
    system.refresh_all();

    let disks = Disks::new_with_refreshed_list();
    let (disk_total, disk_used) = disks.iter().fold((0_u64, 0_u64), |(total, used), disk| {
        let total_space = disk.total_space();
        let available_space = disk.available_space();
        (total + total_space, used + total_space.saturating_sub(available_space))
    });

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();

    SystemResourceSnapshot {
        cpu_usage: system.global_cpu_info().cpu_usage(),
        memory_used: system.used_memory(),
        memory_total: system.total_memory(),
        disk_used,
        disk_total,
        timestamp,
    }
}
