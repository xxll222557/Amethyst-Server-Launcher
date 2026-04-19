use launcher_data::{get_instance, update_instance_java_path};
use launcher_download::{
    download_core_for_instance, download_java_runtime_for_instance, DownloadResult,
};
use launcher_market::{execute_market_download, MarketDownloadRequest};
use crate::backend_data_dir;

#[tauri::command]
pub async fn download_instance_java_runtime(
    app: tauri::AppHandle,
    instance_id: String,
) -> Result<String, String> {
    let dir = backend_data_dir()?;
    let instance = get_instance(&dir, &instance_id)?;

    let java_path = download_java_runtime_for_instance(app, instance).await?;
    let _ = update_instance_java_path(&dir, &instance_id, Some(java_path.clone()));
    Ok(java_path)
}

#[tauri::command]
pub async fn download_instance_core(
    app: tauri::AppHandle,
    instance_id: String,
    include_java: bool,
) -> Result<DownloadResult, String> {
    let dir = backend_data_dir()?;
    let instance = get_instance(&dir, &instance_id)?;

    let result = download_core_for_instance(app, instance, include_java).await?;

    if let Some(java_path) = result.java_executable_path.clone() {
        let _ = update_instance_java_path(&dir, &instance_id, Some(java_path));
    }

    Ok(result)
}

#[tauri::command]
pub async fn download_market_asset(
    app: tauri::AppHandle,
    request: MarketDownloadRequest,
) -> Result<String, String> {
    let data_dir = backend_data_dir()?;
    execute_market_download(app, request, &data_dir).await
}
