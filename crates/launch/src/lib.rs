use launcher_data::InstanceConfig;
use serde::Serialize;
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub instance_id: String,
    pub pid: u32,
    pub command: String,
}

pub fn start_instance(instance: &InstanceConfig) -> Result<LaunchResult, String> {
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

    let mut command = Command::new("java");
    command
        .arg(min_mem.clone())
        .arg(max_mem.clone())
        .arg("-jar")
        .arg("server.jar")
        .arg("nogui")
        .current_dir(instance_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    let child = command
        .spawn()
        .map_err(|err| format!("failed to start java process: {err}"))?;

    Ok(LaunchResult {
        instance_id: instance.id.clone(),
        pid: child.id(),
        command: format!("java {min_mem} {max_mem} -jar server.jar nogui"),
    })
}
