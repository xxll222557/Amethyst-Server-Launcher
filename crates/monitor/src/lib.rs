use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use sysinfo::{Disks, Networks, System};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResourceSnapshot {
    cpu_usage: f32,
    memory_used: u64,
    memory_total: u64,
    disk_used: u64,
    disk_total: u64,
    network_download_bps: u64,
    network_upload_bps: u64,
    timestamp: u64,
}

struct MonitorState {
    system: System,
    disks: Disks,
    networks: Networks,
    last_network_sample: Option<(u64, u64, u64)>,
}

impl MonitorState {
    fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu();
        system.refresh_memory();

        Self {
            system,
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            last_network_sample: None,
        }
    }

    fn sample_network_bps(&mut self, now: u64) -> (u64, u64) {
        self.networks.refresh();

        let total_download = self
            .networks
            .iter()
            .map(|(_, network)| network.total_received())
            .sum::<u64>();
        let total_upload = self
            .networks
            .iter()
            .map(|(_, network)| network.total_transmitted())
            .sum::<u64>();

        let (download_bps, upload_bps) = if let Some((last_down, last_up, last_at)) = self.last_network_sample {
            let elapsed_ms = now.saturating_sub(last_at);
            if elapsed_ms > 0 {
                let elapsed_secs = elapsed_ms as f64 / 1000.0;
                let down_delta = total_download.saturating_sub(last_down);
                let up_delta = total_upload.saturating_sub(last_up);
                (
                    (down_delta as f64 / elapsed_secs) as u64,
                    (up_delta as f64 / elapsed_secs) as u64,
                )
            } else {
                (0, 0)
            }
        } else {
            (0, 0)
        };

        self.last_network_sample = Some((total_download, total_upload, now));
        (download_bps, upload_bps)
    }

    fn collect(&mut self) -> SystemResourceSnapshot {
        let timestamp = now_millis();
        let (network_download_bps, network_upload_bps) = self.sample_network_bps(timestamp);

        #[cfg(target_os = "macos")]
        {
            if let Some(mut snapshot) = collect_system_resources_macos() {
                snapshot.network_download_bps = network_download_bps;
                snapshot.network_upload_bps = network_upload_bps;
                snapshot.timestamp = timestamp;
                return snapshot;
            }
        }

        self.system.refresh_cpu();
        self.system.refresh_memory();
        self.disks.refresh();

        let mut cpu_usage = self.system.global_cpu_info().cpu_usage();
        if !cpu_usage.is_finite() {
            cpu_usage = 0.0;
        }
        cpu_usage = cpu_usage.clamp(0.0, 100.0);

        // Prefer "used = total - available". Also normalize unit differences across sysinfo versions.
        let raw_memory_total = self.system.total_memory();
        let raw_memory_used = raw_memory_total.saturating_sub(self.system.available_memory());
        let (memory_total, memory_used) = normalize_memory_units(raw_memory_total, raw_memory_used);

        let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
        let cwd = std::env::current_dir().ok();
        let selected_disk = home
            .as_deref()
            .and_then(|path| pick_disk_for_path(&self.disks, path))
            .or_else(|| {
                cwd.as_deref()
                    .and_then(|path| pick_disk_for_path(&self.disks, path))
            })
            .or_else(|| pick_root_disk(&self.disks));

        let (disk_total, disk_used) = if let Some(disk) = selected_disk {
            let total = disk.total_space();
            let used = total.saturating_sub(disk.available_space());
            (total, used)
        } else {
            (0, 0)
        };

        SystemResourceSnapshot {
            cpu_usage,
            memory_used,
            memory_total,
            disk_used,
            disk_total,
            network_download_bps,
            network_upload_bps,
            timestamp,
        }
    }
}

fn now_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn collect_system_resources_macos() -> Option<SystemResourceSnapshot> {
    let cpu_usage = read_macos_cpu_usage()?;
    let (memory_used, memory_total) = read_macos_memory_usage()?;
    let (disk_used, disk_total) = read_macos_disk_usage()?;

    Some(SystemResourceSnapshot {
        cpu_usage,
        memory_used,
        memory_total,
        disk_used,
        disk_total,
        network_download_bps: 0,
        network_upload_bps: 0,
        timestamp: now_millis(),
    })
}

#[cfg(target_os = "macos")]
fn run_command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8(output.stdout).ok()
}

#[cfg(target_os = "macos")]
fn parse_leading_number(token: &str) -> Option<f32> {
    let value = token.trim().trim_end_matches('%').trim();
    value.parse::<f32>().ok()
}

#[cfg(target_os = "macos")]
fn read_macos_cpu_usage() -> Option<f32> {
    let output = run_command_output("/usr/bin/top", &["-l", "1", "-n", "0"])?;
    let line = output.lines().find(|line| line.contains("CPU usage:"))?;
    let payload = line.split_once(':')?.1;

    let mut user = None;
    let mut sys = None;

    for part in payload.split(',') {
        let piece = part.trim();
        if piece.ends_with("user") {
            user = parse_leading_number(piece.split_whitespace().next().unwrap_or_default());
        } else if piece.ends_with("sys") {
            sys = parse_leading_number(piece.split_whitespace().next().unwrap_or_default());
        }
    }

    Some((user.unwrap_or(0.0) + sys.unwrap_or(0.0)).clamp(0.0, 100.0))
}

#[cfg(target_os = "macos")]
fn parse_vm_stat_pages(line: &str) -> Option<u64> {
    let raw = line.split(':').nth(1)?.trim().trim_end_matches('.').replace('.', "");
    raw.parse::<u64>().ok()
}

#[cfg(target_os = "macos")]
fn read_macos_memory_usage() -> Option<(u64, u64)> {
    let total_output = run_command_output("/usr/sbin/sysctl", &["-n", "hw.memsize"])?;
    let total = total_output.trim().parse::<u64>().ok()?;

    let vm_output = run_command_output("/usr/bin/vm_stat", &[])?;
    let page_size = vm_output
        .lines()
        .find(|line| line.contains("page size of"))
        .and_then(|line| {
            let start = line.find("page size of")? + "page size of".len();
            let rest = &line[start..];
            let bytes_text = rest.trim().trim_end_matches(" bytes)").trim();
            bytes_text.parse::<u64>().ok()
        })
        .unwrap_or(4096);

    let mut active_pages = 0_u64;
    let mut wired_pages = 0_u64;
    let mut compressed_pages = 0_u64;

    for line in vm_output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Pages active") {
            active_pages = parse_vm_stat_pages(trimmed).unwrap_or(0);
        } else if trimmed.starts_with("Pages wired down") {
            wired_pages = parse_vm_stat_pages(trimmed).unwrap_or(0);
        } else if trimmed.starts_with("Pages occupied by compressor") {
            compressed_pages = parse_vm_stat_pages(trimmed).unwrap_or(0);
        }
    }

    let used_pages = active_pages
        .saturating_add(wired_pages)
        .saturating_add(compressed_pages);
    let used = used_pages.saturating_mul(page_size);

    Some((used.min(total), total))
}

#[cfg(target_os = "macos")]
fn read_macos_disk_usage() -> Option<(u64, u64)> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
    let output = run_command_output("/bin/df", &["-k", &home])?;
    let line = output.lines().nth(1)?;
    let parts: Vec<&str> = line.split_whitespace().collect();

    if parts.len() < 3 {
        return None;
    }

    let total_k = parts.get(1)?.parse::<u64>().ok()?;
    let used_k = parts.get(2)?.parse::<u64>().ok()?;

    Some((
        used_k.saturating_mul(1024),
        total_k.saturating_mul(1024),
    ))
}

fn normalize_memory_units(total: u64, used: u64) -> (u64, u64) {
    // Some sysinfo combinations may report memory in KiB; detect and convert to bytes.
    if total > 0 && total < 1_000_000_000 {
        return (total.saturating_mul(1024), used.saturating_mul(1024));
    }
    (total, used)
}

fn pick_disk_for_path<'a>(disks: &'a Disks, path: &Path) -> Option<&'a sysinfo::Disk> {
    disks
        .iter()
        .filter(|disk| path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
}

fn pick_root_disk(disks: &Disks) -> Option<&sysinfo::Disk> {
    disks
        .iter()
        .find(|disk| disk.mount_point().as_os_str() == "/")
        .or_else(|| disks.iter().max_by_key(|disk| disk.total_space()))
}

static MONITOR_STATE: OnceLock<Mutex<MonitorState>> = OnceLock::new();

pub fn collect_system_resources() -> SystemResourceSnapshot {
    let state = MONITOR_STATE.get_or_init(|| Mutex::new(MonitorState::new()));

    match state.lock() {
        Ok(mut guard) => guard.collect(),
        Err(_) => {
            let mut fallback = MonitorState::new();
            fallback.collect()
        }
    }
}

