pub mod app;

use launcher_data::InstanceConfig;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub instance_id: String,
    pub pid: u32,
    pub command: String,
}

pub struct SpawnedInstance {
    pub child: Child,
    pub launch: LaunchResult,
}

pub fn start_instance(instance: &InstanceConfig) -> Result<LaunchResult, String> {
    let spawned = spawn_instance(instance, false)?;
    Ok(spawned.launch)
}

pub fn resolve_java_executable_for_instance(instance: &InstanceConfig) -> Result<PathBuf, String> {
    let instance_dir = Path::new(&instance.directory);
    resolve_java_executable(instance, instance_dir)
}

pub fn spawn_instance(instance: &InstanceConfig, piped_io: bool) -> Result<SpawnedInstance, String> {
    let instance_dir = Path::new(&instance.directory);
    let jar_path = instance_dir.join("server.jar");

    if !jar_path.exists() {
        return Err(format!(
            "server.jar not found for instance '{}' at {}",
            instance.name,
            jar_path.display()
        ));
    }

    let min_mem = format!("-Xms{}M", instance.min_memory_mb);
    let max_mem = format!("-Xmx{}M", instance.max_memory_mb);

    let java_executable = resolve_java_executable_for_instance(instance)?;
    let java_display = java_executable.to_string_lossy().to_string();

    let mut command = Command::new(&java_executable);
    if piped_io {
        command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped());
    } else {
        command
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .stdin(Stdio::null());
    }

    command
        .arg(min_mem.clone())
        .arg(max_mem.clone())
        .arg("-jar")
        .arg("server.jar")
        .arg("nogui")
        .current_dir(instance_dir);

    let child = command
        .spawn()
        .map_err(|err| {
            if err.kind() == std::io::ErrorKind::NotFound {
                return format!(
                    "E_JAVA_NOT_FOUND::Java executable was not found. Set an absolute Java path in Instance Console, or download Java to {}/runtime/java",
                    instance_dir.display(),
                );
            }
            format!("failed to start java process: {err}")
        })?;

    let launch = LaunchResult {
        instance_id: instance.id.clone(),
        pid: child.id(),
        command: format!("{java_display} {min_mem} {max_mem} -jar server.jar nogui"),
    };

    Ok(SpawnedInstance { child, launch })
}

fn resolve_java_executable(instance: &InstanceConfig, instance_dir: &Path) -> Result<PathBuf, String> {
    if let Some(custom_java_path) = instance
        .java_path
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        let path = PathBuf::from(custom_java_path);
        if path.is_file() {
            return Ok(path);
        }
        if path.is_dir() {
            if let Some(found) = find_java_in_dir(&path, 0) {
                return Ok(found);
            }
        }

        return Err(format!(
            "E_JAVA_INVALID_PATH::Configured Java path is invalid: {}",
            custom_java_path,
        ));
    }

    let candidates = [
        instance_dir.join("runtime").join("java"),
        instance_dir.join(".runtime").join("java"),
    ];

    for runtime_root in candidates {
        if !runtime_root.exists() {
            continue;
        }

        if let Some(found) = find_java_in_dir(&runtime_root, 0) {
            return Ok(found);
        }
    }

    if let Some(shared_runtime_root) = shared_java_runtime_dir_for_version(&instance.version) {
        if let Some(found) = find_java_in_dir(&shared_runtime_root, 0) {
            return Ok(found);
        }
    }

    Err(format!(
        "E_JAVA_NOT_FOUND::Java executable was not found. Set an absolute Java path in Instance Console, or download Java to {}/runtime/java",
        instance_dir.display(),
    ))
}

fn shared_java_runtime_dir_for_version(mc_version: &str) -> Option<PathBuf> {
    if let Some(raw) = std::env::var_os("ASL_JAVA_RUNTIME_DIR") {
        let configured = PathBuf::from(raw);
        if configured.is_absolute() {
            return Some(configured.join(format!("java-{}", recommended_java_major(mc_version))));
        }
    }

    let data_dir = launcher_data_dir().ok()?;
    Some(
        data_dir
            .join("runtime")
            .join("shared-java")
            .join(format!("java-{}", recommended_java_major(mc_version))),
    )
}

fn launcher_data_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "failed to resolve HOME for application data dir".to_string())?;
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

        let home = std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
            .ok_or_else(|| "failed to resolve USERPROFILE for application data dir".to_string())?;

        return Ok(home
            .join("AppData")
            .join("Roaming")
            .join("Amethyst-Server-Launcher"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let home = std::env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "failed to resolve HOME for application data dir".to_string())?;

        if let Some(xdg_data_home) = std::env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(xdg_data_home).join("amethyst-server-launcher"));
        }

        Ok(home.join(".local").join("share").join("amethyst-server-launcher"))
    }
}

fn recommended_java_major(mc_version: &str) -> u32 {
    let (major, minor, patch) = parse_mc_version(mc_version);
    if major > 1 || (major == 1 && (minor > 20 || (minor == 20 && patch >= 5))) {
        return 21;
    }
    if major == 1 && minor >= 18 {
        return 17;
    }
    8
}

fn parse_mc_version(version: &str) -> (u32, u32, u32) {
    let mut parts = version.split('.');
    let major = parts.next().and_then(|v| v.parse::<u32>().ok()).unwrap_or(1);
    let minor = parts.next().and_then(|v| v.parse::<u32>().ok()).unwrap_or(20);
    let patch = parts.next().and_then(|v| v.parse::<u32>().ok()).unwrap_or(0);
    (major, minor, patch)
}

fn find_java_in_dir(dir: &Path, depth: usize) -> Option<PathBuf> {
    if depth > 8 {
        return None;
    }

    let target_name = if cfg!(target_os = "windows") { "java.exe" } else { "java" };

    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_java_in_dir(&path, depth + 1) {
                return Some(found);
            }
            continue;
        }

        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(target_name))
        {
            return Some(path);
        }
    }

    None
}
