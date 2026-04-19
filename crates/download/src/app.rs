use crate::{
    download_java_runtime_with_progress, download_server_core_with_progress, DownloadResult,
};
use launcher_data::InstanceConfig;
use std::path::Path;
use tauri::Emitter;

pub async fn download_java_runtime_for_instance(
    app: tauri::AppHandle,
    instance: InstanceConfig,
) -> Result<String, String> {
    let app_handle = app.clone();
    let java_exec = tauri::async_runtime::spawn_blocking(move || {
        download_java_runtime_with_progress(
            &instance.id,
            Path::new(&instance.directory),
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
    include_java: bool,
) -> Result<DownloadResult, String> {
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        download_server_core_with_progress(
            &instance.id,
            Path::new(&instance.directory),
            &instance.server_type,
            &instance.version,
            include_java,
            |progress| {
                let _ = app_handle.emit("instance-download-progress", &progress);
            },
        )
    })
    .await
    .map_err(|err| format!("download task join error: {err}"))?
}
