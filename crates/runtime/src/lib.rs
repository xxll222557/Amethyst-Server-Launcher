use fs2::FileExt;
use launcher_data::{delete_instance, list_instances, InstanceConfig};
use launcher_launch::{resolve_java_executable_for_instance, spawn_instance, LaunchResult};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Default)]
pub struct ProcessState {
    pub processes: Arc<Mutex<HashMap<String, Child>>>,
    pub logs: Arc<Mutex<HashMap<String, VecDeque<String>>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConsoleLogEvent {
    pub instance_id: String,
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceProcessEvent {
    pub instance_id: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceJavaRuntimeStatus {
    pub available: bool,
    pub path: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceProcessStatus {
    pub running: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancePreflightIssue {
    pub code: String,
    pub message: String,
    pub detail: Option<String>,
    pub hint: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstancePreflightReport {
    pub instance_id: String,
    pub can_start: bool,
    pub issues: Vec<InstancePreflightIssue>,
}

pub fn backend_data_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "failed to resolve HOME for application data dir".to_string())?;

    #[cfg(target_os = "macos")]
    {
        return Ok(home
            .join("Library")
            .join("Application Support")
            .join("Amethyst-Server-Launcher"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            return Ok(PathBuf::from(app_data).join("Amethyst-Server-Launcher"));
        }
        return Ok(home
            .join("AppData")
            .join("Roaming")
            .join("Amethyst-Server-Launcher"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(xdg_data_home) = std::env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(xdg_data_home).join("amethyst-server-launcher"));
        }
        Ok(home.join(".local").join("share").join("amethyst-server-launcher"))
    }
}

pub fn resolve_instance(base_dir: &Path, instance_id: &str) -> Result<InstanceConfig, String> {
    let instances = list_instances(base_dir)?;
    instances
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| format!("instance not found: {instance_id}"))
}

pub fn get_instance_java_runtime_status(base_dir: &Path, instance_id: &str) -> Result<InstanceJavaRuntimeStatus, String> {
    let instances = list_instances(base_dir)?;
    let instance = instances
        .iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| format!("instance not found: {instance_id}"))?;

    match resolve_java_executable_for_instance(instance) {
        Ok(path) => Ok(InstanceJavaRuntimeStatus {
            available: true,
            path: Some(path.to_string_lossy().to_string()),
            reason: None,
        }),
        Err(reason) => Ok(InstanceJavaRuntimeStatus {
            available: false,
            path: None,
            reason: Some(reason),
        }),
    }
}

pub fn delete_instance_with_process_cleanup(
    process_state: &ProcessState,
    base_dir: &Path,
    instance_id: &str,
) -> Result<(), String> {
    {
        let mut map = process_state
            .processes
            .lock()
            .map_err(|_| "failed to lock process state".to_string())?;

        if let Some(child) = map.get_mut(instance_id) {
            if let Some(stdin) = child.stdin.as_mut() {
                let _ = stdin.write_all(b"stop\n");
                let _ = stdin.flush();
            }

            let mut exited = false;
            for _ in 0..8 {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        exited = true;
                        break;
                    }
                    Ok(None) => std::thread::sleep(Duration::from_millis(120)),
                    Err(_) => break,
                }
            }

            if !exited {
                let _ = child.kill();
                let _ = child.wait();
            }
        }

        map.remove(instance_id);
    }

    delete_instance(base_dir, instance_id)
}

pub fn get_instance_process_status(process_state: &ProcessState, instance_id: &str) -> Result<InstanceProcessStatus, String> {
    let mut map = process_state
        .processes
        .lock()
        .map_err(|_| "failed to lock process state".to_string())?;

    if let Some(child) = map.get_mut(instance_id) {
        match child.try_wait() {
            Ok(Some(_)) => {
                map.remove(instance_id);
                Ok(InstanceProcessStatus { running: false })
            }
            Ok(None) => Ok(InstanceProcessStatus { running: true }),
            Err(err) => Err(format!("failed to query process state: {err}")),
        }
    } else {
        Ok(InstanceProcessStatus { running: false })
    }
}

pub fn get_instance_console_logs(
    process_state: &ProcessState,
    instance_id: &str,
    max_lines: Option<usize>,
) -> Result<Vec<String>, String> {
    let limit = max_lines.unwrap_or(400).clamp(1, 2000);
    let map = process_state
        .logs
        .lock()
        .map_err(|_| "failed to lock console logs".to_string())?;

    let lines = map
        .get(instance_id)
        .map(|buffer| {
            let len = buffer.len();
            let start = len.saturating_sub(limit);
            buffer
                .iter()
                .skip(start)
                .cloned()
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    Ok(lines)
}

pub fn send_instance_command(process_state: &ProcessState, instance_id: &str, command: &str) -> Result<(), String> {
    let mut map = process_state
        .processes
        .lock()
        .map_err(|_| "failed to lock process state".to_string())?;
    let child = map
        .get_mut(instance_id)
        .ok_or_else(|| "instance is not running in managed mode".to_string())?;
    let stdin = child
        .stdin
        .as_mut()
        .ok_or_else(|| "stdin is not available for this process".to_string())?;

    stdin
        .write_all(format!("{}\n", command.trim()).as_bytes())
        .map_err(|err| format!("failed to write command: {err}"))?;
    stdin
        .flush()
        .map_err(|err| format!("failed to flush command: {err}"))
}

pub fn stop_instance_process(process_state: &ProcessState, instance_id: &str) -> Result<(), String> {
    let mut map = process_state
        .processes
        .lock()
        .map_err(|_| "failed to lock process state".to_string())?;

    let child = map
        .get_mut(instance_id)
        .ok_or_else(|| "instance is not running in managed mode".to_string())?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(b"stop\n")
            .map_err(|err| format!("failed to send stop command: {err}"))?;
        stdin
            .flush()
            .map_err(|err| format!("failed to flush stop command: {err}"))?;
        return Ok(());
    }

    child
        .kill()
        .map_err(|err| format!("failed to terminate process: {err}"))
}

pub fn check_instance_preflight(base_dir: &Path, instance_id: &str) -> Result<InstancePreflightReport, String> {
    let instance = resolve_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);

    let mut issues = Vec::new();

    let core_path = instance_dir.join("server.jar");
    if !core_path.exists() {
        issues.push(InstancePreflightIssue {
            code: "E_CORE_MISSING".to_string(),
            message: "server.jar was not found".to_string(),
            detail: Some(core_path.to_string_lossy().to_string()),
            hint: Some(
                "Download server core first, or place your custom core as server.jar in the instance directory"
                    .to_string(),
            ),
        });
    }

    let probe_path = instance_dir.join(".asl-write-probe");
    match fs::write(&probe_path, b"probe") {
        Ok(_) => {
            let _ = fs::remove_file(&probe_path);
        }
        Err(err) => {
            issues.push(InstancePreflightIssue {
                code: "E_DIR_NOT_WRITABLE".to_string(),
                message: "Instance directory is not writable".to_string(),
                detail: Some(format!("{}: {err}", instance_dir.display())),
                hint: Some(
                    "Check directory permissions or move the instance to a writable location".to_string(),
                ),
            });
        }
    }

    if let Err(reason) = resolve_java_executable_for_instance(&instance) {
        issues.push(InstancePreflightIssue {
            code: "E_JAVA_MISSING".to_string(),
            message: "Java runtime is unavailable".to_string(),
            detail: Some(reason),
            hint: Some(
                "Download the recommended Java runtime or configure a valid Java path in runtime settings"
                    .to_string(),
            ),
        });
    }

    let server_port = read_server_port(instance_dir).unwrap_or(25565);
    if std::net::TcpListener::bind(("127.0.0.1", server_port)).is_err() {
        issues.push(InstancePreflightIssue {
            code: "E_PORT_IN_USE".to_string(),
            message: "Target port is already in use".to_string(),
            detail: Some(format!("127.0.0.1:{server_port}")),
            hint: Some(
                "Update server-port in server.properties, or stop the process occupying that port"
                    .to_string(),
            ),
        });
    }

    Ok(InstancePreflightReport {
        instance_id: instance_id.to_string(),
        can_start: issues.is_empty(),
        issues,
    })
}

pub fn start_instance_server_managed(
    process_state: &ProcessState,
    instance: &InstanceConfig,
    on_console_log: Arc<dyn Fn(InstanceConsoleLogEvent) + Send + Sync + 'static>,
    on_process_state: Arc<dyn Fn(InstanceProcessEvent) + Send + Sync + 'static>,
) -> Result<LaunchResult, String> {
    ensure_instance_not_locked(instance)?;

    {
        let mut map = process_state
            .processes
            .lock()
            .map_err(|_| "failed to lock process state".to_string())?;
        if let Some(child) = map.get_mut(&instance.id) {
            if child
                .try_wait()
                .map_err(|err| format!("failed to query process state: {err}"))?
                .is_none()
            {
                return Err("instance is already running".to_string());
            }
            map.remove(&instance.id);
        }
    }

    {
        if let Ok(mut logs) = process_state.logs.lock() {
            logs.insert(instance.id.clone(), VecDeque::with_capacity(1200));
        }
    }

    let mut spawned = spawn_instance(instance, true)?;
    let instance_key = instance.id.clone();

    if let Some(stdout) = spawned.child.stdout.take() {
        let id = instance_key.clone();
        let logs = Arc::clone(&process_state.logs);
        let on_console_log = Arc::clone(&on_console_log);
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let line = strip_ansi_codes(&line);
                push_console_log(&logs, &id, line.clone());
                on_console_log(InstanceConsoleLogEvent {
                    instance_id: id.clone(),
                    stream: "stdout".to_string(),
                    line,
                });
            }
        });
    }

    if let Some(stderr) = spawned.child.stderr.take() {
        let id = instance_key.clone();
        let logs = Arc::clone(&process_state.logs);
        let on_console_log = Arc::clone(&on_console_log);
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let line = strip_ansi_codes(&line);
                let decorated = format!("[ERR] {line}");
                push_console_log(&logs, &id, decorated);
                on_console_log(InstanceConsoleLogEvent {
                    instance_id: id.clone(),
                    stream: "stderr".to_string(),
                    line,
                });
            }
        });
    }

    {
        let mut map = process_state
            .processes
            .lock()
            .map_err(|_| "failed to lock process state".to_string())?;
        map.insert(instance_key.clone(), spawned.child);
    }

    let monitor_state = Arc::clone(&process_state.processes);
    let on_process_state_emit = Arc::clone(&on_process_state);
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(700));
        let mut should_break = false;

        if let Ok(mut map) = monitor_state.lock() {
            let mut finished = false;
            if let Some(child) = map.get_mut(&instance_key) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        on_process_state_emit(InstanceProcessEvent {
                            instance_id: instance_key.clone(),
                            status: "stopped".to_string(),
                            message: format!("Instance process exited: {status}"),
                        });
                        finished = true;
                    }
                    Ok(None) => {}
                    Err(err) => {
                        on_process_state_emit(InstanceProcessEvent {
                            instance_id: instance_key.clone(),
                            status: "error".to_string(),
                            message: format!("Failed to read instance process state: {err}"),
                        });
                        finished = true;
                    }
                }
            } else {
                should_break = true;
            }

            if finished {
                map.remove(&instance_key);
                should_break = true;
            }
        } else {
            should_break = true;
        }

        if should_break {
            break;
        }
    });

    Ok(spawned.launch)
}

pub fn read_instance_log_tail(base_dir: &Path, instance_id: &str, max_lines: Option<usize>) -> Result<Vec<String>, String> {
    let instance = resolve_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);
    let candidates = [
        instance_dir.join("logs").join("latest.log"),
        instance_dir.join("latest.log"),
    ];

    let log_path = candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| "latest.log not found yet".to_string())?;

    let content = fs::read_to_string(log_path).map_err(|err| format!("failed to read log file: {err}"))?;
    let limit = max_lines.unwrap_or(300).min(1500);
    let lines = content
        .lines()
        .rev()
        .take(limit)
        .map(|line| line.to_string())
        .collect::<Vec<_>>();

    Ok(lines.into_iter().rev().collect())
}

pub fn list_instance_files(
    base_dir: &Path,
    instance_id: &str,
    relative_path: Option<String>,
) -> Result<Vec<InstanceFileEntry>, String> {
    let instance = resolve_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);
    let current = resolve_instance_relative_path(instance_dir, relative_path.as_deref().unwrap_or(""))?;

    let entries = fs::read_dir(&current).map_err(|err| format!("failed to list directory: {err}"))?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|err| format!("failed to read metadata: {err}"))?;
        let relative = path
            .strip_prefix(instance_dir)
            .map_err(|err| format!("failed to normalize path: {err}"))?
            .to_string_lossy()
            .replace('\\', "/");

        files.push(InstanceFileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: relative,
            is_dir: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
        });
    }

    files.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

pub fn read_instance_text_file(base_dir: &Path, instance_id: &str, relative_path: &str) -> Result<String, String> {
    let instance = resolve_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);
    let path = resolve_instance_relative_path(instance_dir, relative_path)?;

    let metadata = fs::metadata(&path).map_err(|err| format!("failed to stat file: {err}"))?;
    if !metadata.is_file() {
        return Err("target is not a file".to_string());
    }
    if metadata.len() > 2 * 1024 * 1024 {
        return Err("file too large for editor (>2MB)".to_string());
    }

    fs::read_to_string(path).map_err(|err| format!("failed to read file: {err}"))
}

pub fn write_instance_text_file(
    base_dir: &Path,
    instance_id: &str,
    relative_path: &str,
    content: &str,
) -> Result<(), String> {
    let instance = resolve_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);
    let path = resolve_instance_relative_path(instance_dir, relative_path)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("failed to create parent dir: {err}"))?;
    }

    fs::write(path, content).map_err(|err| format!("failed to write file: {err}"))
}

pub fn create_instance_directory(base_dir: &Path, instance_id: &str, relative_path: &str) -> Result<(), String> {
    let instance = resolve_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);
    let path = resolve_instance_relative_path(instance_dir, relative_path)?;
    fs::create_dir_all(path).map_err(|err| format!("failed to create directory: {err}"))
}

pub fn export_text_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create export directory: {err}"))?;
    }

    fs::write(&target, content).map_err(|err| format!("failed to write export file: {err}"))
}

pub fn export_diagnostics_report(
    process_state: &ProcessState,
    base_dir: &Path,
    diagnostics_payload: Option<String>,
) -> Result<String, String> {
    let instances = list_instances(base_dir)?;

    let diagnostics_dir = base_dir.join("diagnostics");
    fs::create_dir_all(&diagnostics_dir)
        .map_err(|err| format!("failed to create diagnostics dir: {err}"))?;

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let report_path = diagnostics_dir.join(format!("diagnostics-{timestamp}.log"));

    let mut report = String::new();
    report.push_str("Amethyst Server Launcher Diagnostics\n");
    report.push_str(&format!("GeneratedAtUnix={timestamp}\n"));
    report.push_str(&format!("DataDir={}\n\n", base_dir.display()));

    report.push_str("[Instances]\n");
    for instance in &instances {
        report.push_str(&format!(
            "- {} | id={} | type={} | version={} | coreDownloaded={} | dir={}\n",
            instance.name,
            instance.id,
            instance.server_type,
            instance.version,
            instance.core_downloaded,
            instance.directory
        ));
    }

    report.push_str("\n[RunningProcesses]\n");
    {
        let map = process_state
            .processes
            .lock()
            .map_err(|_| "failed to lock process state".to_string())?;
        if map.is_empty() {
            report.push_str("- none\n");
        } else {
            for instance_id in map.keys() {
                report.push_str(&format!("- {instance_id}\n"));
            }
        }
    }

    report.push_str("\n[RecentConsoleLogs]\n");
    {
        let logs = process_state
            .logs
            .lock()
            .map_err(|_| "failed to lock console logs".to_string())?;
        if logs.is_empty() {
            report.push_str("- none\n");
        } else {
            for (instance_id, lines) in logs.iter() {
                report.push_str(&format!("## {instance_id}\n"));
                let len = lines.len();
                let start = len.saturating_sub(80);
                for line in lines.iter().skip(start) {
                    report.push_str(line);
                    report.push('\n');
                }
                report.push('\n');
            }
        }
    }

    report.push_str("\n[FrontendDiagnostics]\n");
    if let Some(payload) = diagnostics_payload {
        match serde_json::from_str::<serde_json::Value>(&payload) {
            Ok(value) => {
                let pretty = serde_json::to_string_pretty(&value)
                    .map_err(|err| format!("failed to serialize frontend diagnostics: {err}"))?;
                report.push_str(&pretty);
                report.push('\n');
            }
            Err(_) => {
                report.push_str("(raw)\n");
                report.push_str(&payload);
                report.push('\n');
            }
        }
    } else {
        report.push_str("- none\n");
    }

    fs::write(&report_path, report).map_err(|err| format!("failed to write diagnostics report: {err}"))?;

    Ok(report_path.to_string_lossy().to_string())
}

fn push_console_log(
    logs: &Arc<Mutex<HashMap<String, VecDeque<String>>>>,
    instance_id: &str,
    line: String,
) {
    if let Ok(mut map) = logs.lock() {
        let buffer = map
            .entry(instance_id.to_string())
            .or_insert_with(|| VecDeque::with_capacity(1200));
        if buffer.len() >= 1200 {
            let _ = buffer.pop_front();
        }
        buffer.push_back(line);
    }
}

fn strip_ansi_codes(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == 0x1b {
            if i + 1 >= bytes.len() {
                i += 1;
                continue;
            }

            match bytes[i + 1] {
                b'[' => {
                    i += 2;
                    while i < bytes.len() {
                        let b = bytes[i];
                        i += 1;
                        if (0x40..=0x7e).contains(&b) {
                            break;
                        }
                    }
                    continue;
                }
                b']' => {
                    i += 2;
                    while i < bytes.len() {
                        if bytes[i] == 0x07 {
                            i += 1;
                            break;
                        }
                        if bytes[i] == 0x1b && i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                            i += 2;
                            break;
                        }
                        i += 1;
                    }
                    continue;
                }
                _ => {
                    i += 2;
                    continue;
                }
            }
        }

        out.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&out).into_owned()
}

fn ensure_instance_not_locked(instance: &InstanceConfig) -> Result<(), String> {
    let lock_path = Path::new(&instance.directory).join("world").join("session.lock");
    if !lock_path.exists() {
        return Ok(());
    }

    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&lock_path)
        .map_err(|err| {
            format!(
                "E_INSTANCE_LOCK_CHECK_FAILED::Failed to inspect world lock file {}: {err}",
                lock_path.display()
            )
        })?;

    match file.try_lock_exclusive() {
        Ok(()) => {
            let _ = file.unlock();
            Ok(())
        }
        Err(err) => {
            if err.kind() == std::io::ErrorKind::WouldBlock {
                return Err(format!(
                    "E_INSTANCE_ALREADY_RUNNING::Instance world lock file is still in use: {}. Stop the running instance and retry.",
                    lock_path.display()
                ));
            }

            Err(format!(
                "E_INSTANCE_LOCK_CHECK_FAILED::Failed to determine whether instance is running ({}): {err}",
                lock_path.display()
            ))
        }
    }
}

fn read_server_port(instance_dir: &Path) -> Option<u16> {
    let properties = instance_dir.join("server.properties");
    let raw = fs::read_to_string(properties).ok()?;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some((key, value)) = trimmed.split_once('=') {
            if key.trim() == "server-port" {
                if let Ok(port) = value.trim().parse::<u16>() {
                    return Some(port);
                }
            }
        }
    }

    None
}

fn clean_relative_path(input: &str) -> Result<PathBuf, String> {
    let mut output = PathBuf::new();
    for component in Path::new(input).components() {
        match component {
            Component::Normal(part) => output.push(part),
            Component::CurDir => {}
            _ => return Err("invalid relative path".to_string()),
        }
    }
    Ok(output)
}

fn resolve_instance_relative_path(instance_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let clean = clean_relative_path(relative_path)?;
    Ok(instance_dir.join(clean))
}
