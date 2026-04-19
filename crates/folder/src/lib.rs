use launcher_data::get_instance;
use serde::Serialize;
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

pub fn read_instance_log_tail(base_dir: &Path, instance_id: &str, max_lines: Option<usize>) -> Result<Vec<String>, String> {
    let instance = get_instance(base_dir, instance_id)?;
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
    let instance = get_instance(base_dir, instance_id)?;
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
    let instance = get_instance(base_dir, instance_id)?;
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
    let instance = get_instance(base_dir, instance_id)?;
    let instance_dir = Path::new(&instance.directory);
    let path = resolve_instance_relative_path(instance_dir, relative_path)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("failed to create parent dir: {err}"))?;
    }

    fs::write(path, content).map_err(|err| format!("failed to write file: {err}"))
}

pub fn create_instance_directory(base_dir: &Path, instance_id: &str, relative_path: &str) -> Result<(), String> {
    let instance = get_instance(base_dir, instance_id)?;
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
