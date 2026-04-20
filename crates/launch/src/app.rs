use fs2::FileExt;
use launcher_data::{delete_instance, get_instance, InstanceConfig};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::{resolve_java_executable_for_instance, spawn_instance, LaunchResult};

#[derive(Default)]
pub struct ProcessState {
    pub processes: Arc<Mutex<HashMap<String, Child>>>,
    pub logs: Arc<Mutex<HashMap<String, VecDeque<String>>>>,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceCrashAnalysisEvent {
    pub instance_id: String,
    pub crash_code: String,
    pub summary: String,
    pub detail: String,
    pub confidence: u8,
    pub suggestions: Vec<String>,
    pub log_excerpt: Option<String>,
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

pub fn get_instance_java_runtime_status(base_dir: &Path, instance_id: &str) -> Result<InstanceJavaRuntimeStatus, String> {
    let instance = get_instance(base_dir, instance_id)?;

    match resolve_java_executable_for_instance(&instance) {
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
            buffer.iter().skip(start).cloned().collect::<Vec<String>>()
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
    let instance = get_instance(base_dir, instance_id)?;
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
    on_crash_analysis: Arc<dyn Fn(InstanceCrashAnalysisEvent) + Send + Sync + 'static>,
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
    let instance_dir = instance.directory.clone();

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
    let monitor_logs = Arc::clone(&process_state.logs);
    let on_process_state_emit = Arc::clone(&on_process_state);
    let on_crash_analysis_emit = Arc::clone(&on_crash_analysis);
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
                        // Give IO reader threads a brief window to flush tail logs for short-lived crashes.
                        std::thread::sleep(Duration::from_millis(220));
                        let recent_logs = read_recent_logs(&monitor_logs, &instance_key, 240);
                        let analysis = analyze_instance_crash(
                            &instance_key,
                            &instance_dir,
                            status.code(),
                            recent_logs,
                        );
                        // Some startup failures (like EULA not accepted) may still exit with code 0.
                        // Emit analysis when non-zero exit OR when we matched a known crash signature.
                        if !status.success() || analysis.crash_code != "E_UNKNOWN_CRASH" {
                            on_crash_analysis_emit(analysis);
                        }
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

fn push_console_log(logs: &Arc<Mutex<HashMap<String, VecDeque<String>>>>, instance_id: &str, line: String) {
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

fn read_recent_logs(
    logs: &Arc<Mutex<HashMap<String, VecDeque<String>>>>,
    instance_id: &str,
    limit: usize,
) -> Vec<String> {
    let cap = limit.clamp(20, 500);
    if let Ok(map) = logs.lock() {
        return map
            .get(instance_id)
            .map(|buffer| {
                let start = buffer.len().saturating_sub(cap);
                buffer.iter().skip(start).cloned().collect::<Vec<String>>()
            })
            .unwrap_or_default();
    }

    Vec::new()
}

fn analyze_instance_crash(
    instance_id: &str,
    instance_dir: &str,
    exit_code: Option<i32>,
    recent_logs: Vec<String>,
) -> InstanceCrashAnalysisEvent {
    let joined = recent_logs.join("\n");
    let lowered = joined.to_lowercase();
    let excerpt = pick_log_excerpt(&recent_logs, &lowered);

    if lowered.contains("failed to bind to port")
        || lowered.contains("address already in use")
        || lowered.contains("bind failed")
    {
        return InstanceCrashAnalysisEvent {
            instance_id: instance_id.to_string(),
            crash_code: "E_PORT_IN_USE".to_string(),
            summary: "The startup port is already in use, so the server exited immediately.".to_string(),
            detail: "Another process is occupying the target port. Free it or change server-port in server.properties."
                .to_string(),
            confidence: 92,
            suggestions: vec![
                "Stop the process using the port and retry startup.".to_string(),
                "Change server-port to an available port in server.properties.".to_string(),
            ],
            log_excerpt: excerpt,
        };
    }

    if lowered.contains("you need to agree to the eula")
        || lowered.contains("eula.txt")
        || lowered.contains("eula=false")
    {
        return InstanceCrashAnalysisEvent {
            instance_id: instance_id.to_string(),
            crash_code: "E_EULA_NOT_ACCEPTED".to_string(),
            summary: "EULA is not accepted, so the server terminated itself.".to_string(),
            detail: "Open eula.txt in the instance directory and change eula=false to eula=true."
                .to_string(),
            confidence: 96,
            suggestions: vec![
                "Set eula=true in eula.txt.".to_string(),
                "Save the file and start the instance again.".to_string(),
            ],
            log_excerpt: excerpt,
        };
    }

    if lowered.contains("outofmemoryerror")
        || lowered.contains("could not reserve enough space")
        || lowered.contains("java heap space")
    {
        return InstanceCrashAnalysisEvent {
            instance_id: instance_id.to_string(),
            crash_code: "E_MEMORY_INSUFFICIENT".to_string(),
            summary: "The JVM crashed due to insufficient memory.".to_string(),
            detail: "Current memory settings may exceed available RAM, or Xms/Xmx are not well configured."
                .to_string(),
            confidence: 90,
            suggestions: vec![
                "Lower the maximum heap setting (Xmx) and keep Xms conservative.".to_string(),
                "Close other memory-heavy applications before retrying.".to_string(),
            ],
            log_excerpt: excerpt,
        };
    }

    if lowered.contains("unsupportedclassversionerror")
        || lowered.contains("has been compiled by a more recent version")
    {
        return InstanceCrashAnalysisEvent {
            instance_id: instance_id.to_string(),
            crash_code: "E_JAVA_VERSION_MISMATCH".to_string(),
            summary: "Java version mismatch prevented server startup.".to_string(),
            detail: "The configured Java is older than required, or runtime settings point to the wrong version."
                .to_string(),
            confidence: 95,
            suggestions: vec![
                "Switch to the recommended Java version.".to_string(),
                "Confirm runtime settings match server core requirements.".to_string(),
            ],
            log_excerpt: excerpt,
        };
    }

    if lowered.contains("noclassdeffounderror")
        || lowered.contains("classnotfoundexception")
        || lowered.contains("nosuchmethoderror")
        || lowered.contains("failed to load plugin")
    {
        return InstanceCrashAnalysisEvent {
            instance_id: instance_id.to_string(),
            crash_code: "E_PLUGIN_OR_MOD_CONFLICT".to_string(),
            summary: "A plugin or mod compatibility conflict likely caused the crash.".to_string(),
            detail: "Class loading or method signature errors usually indicate version-incompatible plugins or mods."
                .to_string(),
            confidence: 82,
            suggestions: vec![
                "Roll back recently added or updated plugins/mods.".to_string(),
                "Check compatibility matrix for your server core and plugins/mods.".to_string(),
            ],
            log_excerpt: excerpt,
        };
    }

    let code_text = exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unknown".to_string());

    if is_eula_not_accepted(instance_dir) {
        return InstanceCrashAnalysisEvent {
            instance_id: instance_id.to_string(),
            crash_code: "E_EULA_NOT_ACCEPTED".to_string(),
            summary: "EULA is not accepted, so the server terminated itself.".to_string(),
            detail: "Open eula.txt in the instance directory and change eula=false to eula=true."
                .to_string(),
            confidence: 92,
            suggestions: vec![
                "Set eula=true in eula.txt.".to_string(),
                "Save the file and start the instance again.".to_string(),
            ],
            log_excerpt: excerpt,
        };
    }

    InstanceCrashAnalysisEvent {
        instance_id: instance_id.to_string(),
        crash_code: "E_UNKNOWN_CRASH".to_string(),
        summary: "Server exited unexpectedly and no specific root cause was matched.".to_string(),
        detail: format!("Process exit code: {code_text}. Check the console tail logs for more details."),
        confidence: 45,
        suggestions: vec![
            "Open the instance console and inspect the last 100 lines.".to_string(),
            "If crashes repeat, export diagnostics for further analysis.".to_string(),
        ],
        log_excerpt: excerpt,
    }
}

fn pick_log_excerpt(recent_logs: &[String], lowered: &str) -> Option<String> {
    if recent_logs.is_empty() {
        return None;
    }

    let priority_tokens = [
        "address already in use",
        "failed to bind to port",
        "you need to agree to the eula",
        "outofmemoryerror",
        "java heap space",
        "unsupportedclassversionerror",
        "compiled by a more recent version",
        "noclassdeffounderror",
        "classnotfoundexception",
        "failed to load plugin",
        "exception",
        "error",
    ];

    for token in priority_tokens {
        if !lowered.contains(token) {
            continue;
        }
        if let Some(line) = recent_logs
            .iter()
            .rev()
            .find(|line| line.to_lowercase().contains(token))
        {
            return Some(line.clone());
        }
    }

    recent_logs.last().cloned()
}

fn is_eula_not_accepted(instance_dir: &str) -> bool {
    let path = Path::new(instance_dir).join("eula.txt");
    let Ok(raw) = fs::read_to_string(path) else {
        return false;
    };

    raw.lines().any(|line| {
        let trimmed = line.trim().to_lowercase();
        trimmed == "eula=false" || trimmed.starts_with("eula=false#")
    })
}
