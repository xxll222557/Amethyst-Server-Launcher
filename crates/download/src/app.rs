use crate::{
    download_java_runtime_with_progress_in, download_server_core_with_progress, recommended_java_major,
    DownloadResult,
};
use launcher_data::InstanceConfig;
use std::path::{Path, PathBuf};
use tauri::Emitter;

fn resolve_shared_java_root(data_dir: &Path) -> PathBuf {
    if let Some(raw) = std::env::var_os("ASL_JAVA_RUNTIME_DIR") {
        let configured = PathBuf::from(raw);
        if configured.is_absolute() {
            return configured;
        }
    }

    data_dir.join("runtime").join("shared-java")
}

fn resolve_shared_java_runtime_dir(data_dir: &Path, mc_version: &str) -> PathBuf {
    let major = recommended_java_major(mc_version);
    resolve_shared_java_root(data_dir).join(format!("java-{major}"))
}

pub async fn download_java_runtime_for_instance(
    app: tauri::AppHandle,
    instance: InstanceConfig,
    data_dir: &Path,
) -> Result<String, String> {
    let shared_runtime_dir = resolve_shared_java_runtime_dir(data_dir, &instance.version);
    let app_handle = app.clone();
    let java_exec = tauri::async_runtime::spawn_blocking(move || {
        download_java_runtime_with_progress_in(
            &instance.id,
            &shared_runtime_dir,
            &instance.version,
            |progress| {
                let _ = app_handle.emit("instance-download-progress", &progress);
            },
        )
    })
    .await
    .map_err(|err| format!("java download task join error: {err}"))??;

    Ok(java_exec.to_string_lossy().to_string())
}

pub async fn download_core_for_instance(
    app: tauri::AppHandle,
    instance: InstanceConfig,
    data_dir: &Path,
    include_java: bool,
) -> Result<DownloadResult, String> {
    let instance_id = instance.id.clone();
    let instance_version = instance.version.clone();
    let shared_runtime_dir = resolve_shared_java_runtime_dir(data_dir, &instance_version);

    let app_handle = app.clone();

    let mut result = tauri::async_runtime::spawn_blocking(move || {
        download_server_core_with_progress(
            &instance.id,
            Path::new(&instance.directory),
            &instance.server_type,
            &instance.version,
            false,
            |progress| {
                let _ = app_handle.emit("instance-download-progress", &progress);
            },
        )
    })
    .await
    .map_err(|err| format!("download task join error: {err}"))??;

    if include_java {
        let app_handle = app;
        let java_exec = tauri::async_runtime::spawn_blocking(move || {
            download_java_runtime_with_progress_in(
                &instance_id,
                &shared_runtime_dir,
                &instance_version,
                |progress| {
                    let _ = app_handle.emit("instance-download-progress", &progress);
                },
            )
        })
        .await
        .map_err(|err| format!("java download task join error: {err}"))??;

        result.java_downloaded = true;
        result.java_executable_path = Some(java_exec.to_string_lossy().to_string());
    }

    Ok(result)
}
