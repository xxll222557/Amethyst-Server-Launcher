use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    pub id: String,
    pub name: String,
    pub server_type: String,
    pub version: String,
    pub directory: String,
    pub min_memory_mb: u32,
    pub max_memory_mb: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceRequest {
    pub name: String,
    pub server_type: String,
    pub version: String,
    pub min_memory_mb: u32,
    pub max_memory_mb: u32,
}

fn instances_file(base_dir: &Path) -> PathBuf {
    base_dir.join("instances.json")
}

fn instances_root(base_dir: &Path) -> PathBuf {
    base_dir.join("instances")
}

fn ensure_layout(base_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(base_dir).map_err(|err| format!("failed to create base dir: {err}"))?;
    fs::create_dir_all(instances_root(base_dir))
        .map_err(|err| format!("failed to create instances dir: {err}"))?;

    let file = instances_file(base_dir);
    if !file.exists() {
        fs::write(&file, "[]").map_err(|err| format!("failed to init instances file: {err}"))?;
    }

    Ok(())
}

pub fn list_instances(base_dir: &Path) -> Result<Vec<InstanceConfig>, String> {
    ensure_layout(base_dir)?;

    let raw = fs::read_to_string(instances_file(base_dir))
        .map_err(|err| format!("failed to read instances file: {err}"))?;
    let instances: Vec<InstanceConfig> =
        serde_json::from_str(&raw).map_err(|err| format!("failed to parse instances file: {err}"))?;

    Ok(instances)
}

fn save_instances(base_dir: &Path, instances: &[InstanceConfig]) -> Result<(), String> {
    let body = serde_json::to_string_pretty(instances)
        .map_err(|err| format!("failed to serialize instances: {err}"))?;
    fs::write(instances_file(base_dir), body)
        .map_err(|err| format!("failed to write instances file: {err}"))?;

    Ok(())
}

pub fn create_instance(base_dir: &Path, req: CreateInstanceRequest) -> Result<InstanceConfig, String> {
    if req.name.trim().is_empty() {
        return Err("instance name cannot be empty".to_string());
    }

    if req.max_memory_mb < req.min_memory_mb {
        return Err("max memory must be >= min memory".to_string());
    }

    let mut instances = list_instances(base_dir)?;

    let id = format!(
        "inst-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or_default()
    );

    let dir = instances_root(base_dir).join(&id);
    fs::create_dir_all(&dir).map_err(|err| format!("failed to create instance dir: {err}"))?;

    let next = InstanceConfig {
        id,
        name: req.name,
        server_type: req.server_type,
        version: req.version,
        directory: dir.to_string_lossy().to_string(),
        min_memory_mb: req.min_memory_mb,
        max_memory_mb: req.max_memory_mb,
    };

    instances.push(next.clone());
    save_instances(base_dir, &instances)?;

    Ok(next)
}
