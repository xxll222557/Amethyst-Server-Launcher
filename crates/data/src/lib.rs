use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceConfig {
    pub id: String,
    pub name: String,
    pub server_type: String,
    #[serde(default)]
    pub server_goal: Option<String>,
    #[serde(default)]
    pub creation_mode: Option<String>,
    #[serde(default)]
    pub framework_description: Option<String>,
    pub version: String,
    pub directory: String,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub core_downloaded: bool,
    pub min_memory_mb: u32,
    pub max_memory_mb: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInstanceRequest {
    pub name: String,
    pub server_type: String,
    pub server_goal: Option<String>,
    pub creation_mode: Option<String>,
    pub framework_description: Option<String>,
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
    let mut instances: Vec<InstanceConfig> =
        serde_json::from_str(&raw).map_err(|err| format!("failed to parse instances file: {err}"))?;

    for instance in &mut instances {
        let server_jar = Path::new(&instance.directory).join("server.jar");
        instance.core_downloaded = server_jar.exists();
    }

    Ok(instances)
}

pub fn get_instance(base_dir: &Path, instance_id: &str) -> Result<InstanceConfig, String> {
    let instances = list_instances(base_dir)?;
    instances
        .into_iter()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| format!("instance not found: {instance_id}"))
}

fn save_instances(base_dir: &Path, instances: &[InstanceConfig]) -> Result<(), String> {
    let body = serde_json::to_string_pretty(instances)
        .map_err(|err| format!("failed to serialize instances: {err}"))?;
    fs::write(instances_file(base_dir), body)
        .map_err(|err| format!("failed to write instances file: {err}"))?;

    Ok(())
}

fn ensure_instance_layout(instance_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(instance_dir).map_err(|err| format!("failed to create instance dir: {err}"))?;
    fs::create_dir_all(instance_dir.join("runtime"))
        .map_err(|err| format!("failed to create runtime dir: {err}"))?;
    fs::create_dir_all(instance_dir.join("logs"))
        .map_err(|err| format!("failed to create logs dir: {err}"))?;
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
    ensure_instance_layout(&dir)?;

    let next = InstanceConfig {
        id,
        name: req.name,
        server_type: req.server_type,
        server_goal: req.server_goal,
        creation_mode: req.creation_mode,
        framework_description: req.framework_description,
        version: req.version,
        directory: dir.to_string_lossy().to_string(),
        java_path: None,
        core_downloaded: false,
        min_memory_mb: req.min_memory_mb,
        max_memory_mb: req.max_memory_mb,
    };

    instances.push(next.clone());
    save_instances(base_dir, &instances)?;

    Ok(next)
}

pub fn update_instance_java_path(
    base_dir: &Path,
    instance_id: &str,
    java_path: Option<String>,
) -> Result<InstanceConfig, String> {
    let mut instances = list_instances(base_dir)?;
    let instance = instances
        .iter_mut()
        .find(|item| item.id == instance_id)
        .ok_or_else(|| format!("instance not found: {instance_id}"))?;

    instance.java_path = java_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let updated = instance.clone();
    save_instances(base_dir, &instances)?;
    Ok(updated)
}

pub fn delete_instance(base_dir: &Path, instance_id: &str) -> Result<(), String> {
    let mut instances = list_instances(base_dir)?;
    let index = instances
        .iter()
        .position(|item| item.id == instance_id)
        .ok_or_else(|| format!("instance not found: {instance_id}"))?;

    let target = instances.remove(index);

    let dir = Path::new(&target.directory);
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|err| format!("failed to remove instance directory: {err}"))?;
    }

    save_instances(base_dir, &instances)
}
