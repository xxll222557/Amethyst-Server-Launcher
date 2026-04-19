use serde::Deserialize;
use std::path::{Path, PathBuf};
use url::Url;
use tauri::Emitter;
use launcher_download::download_url_to_path_with_progress;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketDownloadRequest {
    pub task_id: String,
    pub market_item_id: String,
    pub category: String,
    pub item: String,
    pub file_name: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PreparedMarketDownload {
    pub task_id: String,
    pub item: String,
    pub message: Option<String>,
    pub source_url: String,
    pub output_path: PathBuf,
}

struct MarketAssetDefinition {
    id: &'static str,
    category: &'static str,
    source_url: &'static str,
    file_name: &'static str,
}

const MARKET_ASSETS: &[MarketAssetDefinition] = &[
    MarketAssetDefinition {
        id: "paper-1214",
        category: "server",
        source_url: "https://api.purpurmc.org/v2/purpur/1.21.4/latest/download",
        file_name: "purpur-1.21.4.jar",
    },
    MarketAssetDefinition {
        id: "fabric-1214",
        category: "server",
        source_url: "https://meta.fabricmc.net/v2/versions/loader/1.21.4/0.16.10/1.0.1/server/jar",
        file_name: "fabric-server-1.21.4.jar",
    },
    MarketAssetDefinition {
        id: "forge-1201",
        category: "server",
        source_url: "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.3.12/forge-1.20.1-47.3.12-installer.jar",
        file_name: "forge-1.20.1-47.3.12-installer.jar",
    },
    MarketAssetDefinition {
        id: "luckperms",
        category: "plugin",
        source_url: "https://download.luckperms.net/1567/bukkit/loader/LuckPerms-Bukkit-5.4.130.jar",
        file_name: "LuckPerms-Bukkit-5.4.130.jar",
    },
    MarketAssetDefinition {
        id: "essentialsx",
        category: "plugin",
        source_url: "https://github.com/EssentialsX/Essentials/releases/download/2.21.0/EssentialsX-2.21.0.jar",
        file_name: "EssentialsX-2.21.0.jar",
    },
    MarketAssetDefinition {
        id: "geyser",
        category: "plugin",
        source_url: "https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot",
        file_name: "Geyser-Spigot.jar",
    },
    MarketAssetDefinition {
        id: "atm9",
        category: "modpack",
        source_url: "https://github.com/AllTheMods/ATM-9/releases/download/0.3.2/Server-Files-0.3.2.zip",
        file_name: "ATM9-Server-Files-0.3.2.zip",
    },
    MarketAssetDefinition {
        id: "prominence2",
        category: "modpack",
        source_url: "https://github.com/TerraFirmaGreg-Team/TerraFirmaGreg-Modern/releases/download/v0.7.15/TerraFirmaGregModern-ServerPack-0.7.15.zip",
        file_name: "Prominence2-ServerPack-0.7.15.zip",
    },
    MarketAssetDefinition {
        id: "fabulously-optimized",
        category: "modpack",
        source_url: "https://github.com/Fabulously-Optimized/fabulously-optimized/releases/download/6.4.0/Fabulously.Optimized-6.4.0.mrpack",
        file_name: "Fabulously.Optimized-6.4.0.mrpack",
    },
    MarketAssetDefinition {
        id: "temurin-21",
        category: "java",
        source_url: "https://api.adoptium.net/v3/binary/latest/21/ga/mac/x64/jdk/hotspot/normal/eclipse",
        file_name: "temurin-21-jdk-macos-x64.tar.gz",
    },
    MarketAssetDefinition {
        id: "zulu-17",
        category: "java",
        source_url: "https://cdn.azul.com/zulu/bin/zulu17.56.15-ca-jdk17.0.14-macosx_x64.tar.gz",
        file_name: "zulu-17-jdk-macos-x64.tar.gz",
    },
    MarketAssetDefinition {
        id: "graalvm-21",
        category: "java",
        source_url: "https://download.oracle.com/java/21/latest/jdk-21_macos-x64_bin.tar.gz",
        file_name: "oracle-jdk-21-macos-x64.tar.gz",
    },
];

const MARKET_ALLOWED_HOSTS: &[&str] = &[
    "api.purpurmc.org",
    "meta.fabricmc.net",
    "maven.minecraftforge.net",
    "download.luckperms.net",
    "github.com",
    "download.geysermc.org",
    "api.adoptium.net",
    "cdn.azul.com",
    "download.oracle.com",
];

fn market_err(code: &str, message: impl AsRef<str>) -> String {
    format!("[{code}] {}", message.as_ref())
}

fn find_market_asset(item_id: &str) -> Option<&'static MarketAssetDefinition> {
    MARKET_ASSETS.iter().find(|asset| asset.id == item_id)
}

fn validate_market_source(url_text: &str) -> Result<(), String> {
    let parsed = Url::parse(url_text)
        .map_err(|err| market_err("ASL_MARKET_INVALID_URL", format!("invalid source url: {err}")))?;

    if parsed.scheme() != "https" {
        return Err(market_err("ASL_MARKET_INVALID_URL", "market source must use https"));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| market_err("ASL_MARKET_INVALID_URL", "market source host is missing"))?;

    if !MARKET_ALLOWED_HOSTS.iter().any(|allowed| *allowed == host) {
        return Err(market_err(
            "ASL_MARKET_UNSUPPORTED_HOST",
            format!("market source host is not allowed: {host}"),
        ));
    }

    Ok(())
}

fn sanitize_market_file_name(file_name: &str) -> Result<String, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() || trimmed.len() > 150 {
        return Err(market_err(
            "ASL_MARKET_INVALID_FILENAME",
            "market file name is empty or too long",
        ));
    }

    if trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains("..") {
        return Err(market_err(
            "ASL_MARKET_INVALID_FILENAME",
            "market file name contains forbidden path symbols",
        ));
    }

    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_')
    {
        return Err(market_err(
            "ASL_MARKET_INVALID_FILENAME",
            "market file name contains unsupported characters",
        ));
    }

    Ok(trimmed.to_string())
}

fn resolve_market_output_path(data_dir: &Path, category: &str, file_name: &str) -> Result<PathBuf, String> {
    let market_root = data_dir.join("downloads").join("market");
    let category_dir = market_root.join(category);
    let output_path = category_dir.join(file_name);

    let canonical_root = market_root.canonicalize().unwrap_or(market_root);

    let output_parent = output_path
        .parent()
        .ok_or_else(|| market_err("ASL_MARKET_PATH_RESTRICTED", "failed to resolve output parent"))?;
    std::fs::create_dir_all(output_parent)
        .map_err(|err| market_err("ASL_MARKET_INTERNAL", format!("failed to create output dir: {err}")))?;

    let canonical_parent = output_parent
        .canonicalize()
        .map_err(|err| market_err("ASL_MARKET_INTERNAL", format!("failed to resolve output dir: {err}")))?;

    if !canonical_parent.starts_with(&canonical_root) {
        return Err(market_err(
            "ASL_MARKET_PATH_RESTRICTED",
            "market output path is outside of allowed directory",
        ));
    }

    Ok(output_path)
}

pub fn prepare_market_download(
    request: &MarketDownloadRequest,
    data_dir: &Path,
) -> Result<PreparedMarketDownload, String> {
    let asset = find_market_asset(&request.market_item_id)
        .ok_or_else(|| market_err("ASL_MARKET_ITEM_NOT_FOUND", "market item id is not recognized"))?;

    if request.category != asset.category {
        return Err(market_err(
            "ASL_MARKET_INVALID_REQUEST",
            "market request category does not match item definition",
        ));
    }

    let safe_file_name = sanitize_market_file_name(&request.file_name)?;
    if safe_file_name != asset.file_name {
        return Err(market_err(
            "ASL_MARKET_INVALID_REQUEST",
            "market request file name does not match item definition",
        ));
    }

    validate_market_source(asset.source_url)?;

    Ok(PreparedMarketDownload {
        task_id: request.task_id.clone(),
        item: request.item.clone(),
        message: request.message.clone(),
        source_url: asset.source_url.to_string(),
        output_path: resolve_market_output_path(data_dir, asset.category, &safe_file_name)?,
    })
}

pub async fn execute_market_download(
    app: tauri::AppHandle,
    request: MarketDownloadRequest,
    data_dir: &Path,
) -> Result<String, String> {
    let prepared = prepare_market_download(&request, data_dir)?;
    let app_handle = app.clone();
    let output_path = prepared.output_path.to_string_lossy().to_string();
    let output_path_for_task = output_path.clone();
    let source_url = prepared.source_url;
    let task_id = prepared.task_id;
    let item = prepared.item;
    let message = prepared.message;

    tauri::async_runtime::spawn_blocking(move || {
        download_url_to_path_with_progress(
            &task_id,
            &item,
            &source_url,
            Path::new(&output_path_for_task),
            message.as_deref().unwrap_or("下载市场资源中"),
            |progress| {
                let _ = app_handle.emit("market-download-progress", &progress);
            },
        )
    })
    .await
    .map_err(|err| format!("[ASL_MARKET_JOIN_FAILED] market download task join error: {err}"))?
    .map_err(|err| format!("[ASL_MARKET_DOWNLOAD_FAILED] {err}"))?;

    Ok(output_path)
}
