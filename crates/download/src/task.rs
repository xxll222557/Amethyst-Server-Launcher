use crate::error::{format_error, DownloadTaskResult};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{copy, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub instance_id: String,
    pub server_type: String,
    pub version: String,
    pub source_url: String,
    pub output_path: String,
    pub bytes_written: u64,
    pub java_downloaded: bool,
    pub java_executable_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub instance_id: String,
    pub item: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: f64,
    pub bytes_per_second: f64,
    pub status: String,
    pub message: Option<String>,
}

pub fn download_server_core(
    instance_id: &str,
    instance_dir: &Path,
    server_type: &str,
    version: &str,
) -> DownloadTaskResult<DownloadResult> {
    download_server_core_with_progress(instance_id, instance_dir, server_type, version, false, |_| {})
}

pub fn download_java_runtime_with_progress<F>(
    instance_id: &str,
    instance_dir: &Path,
    mc_version: &str,
    mut on_progress: F,
) -> DownloadTaskResult<PathBuf>
where
    F: FnMut(DownloadProgress),
{
    let java_root = instance_dir.join("runtime").join("java");
    if let Some(existing) = find_java_executable(&java_root) {
        on_progress(DownloadProgress {
            instance_id: instance_id.to_string(),
            item: "java-runtime".to_string(),
            downloaded_bytes: 1,
            total_bytes: Some(1),
            percent: 100.0,
            bytes_per_second: 0.0,
            status: "completed".to_string(),
            message: Some(format!("复用现有 Java 运行时: {}", existing.display())),
        });
        return Ok(existing);
    }

    let client = Client::builder()
        .user_agent("amethyst-server-launcher/0.1")
        .build()
        .map_err(|err| format_error("failed to build http client", err))?;

    let java_major = recommended_java_major(mc_version);
    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: "java-runtime".to_string(),
        downloaded_bytes: 0,
        total_bytes: None,
        percent: 0.0,
        bytes_per_second: 0.0,
        status: "starting".to_string(),
        message: Some(format!("启动前自动下载 Java {java_major} 运行时")),
    });

    let java_exec = download_java_runtime(&client, instance_id, instance_dir, java_major, &mut on_progress)?;

    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: "java-runtime".to_string(),
        downloaded_bytes: 1,
        total_bytes: Some(1),
        percent: 100.0,
        bytes_per_second: 0.0,
        status: "completed".to_string(),
        message: Some(format!("Java 自动准备完成: {}", java_exec.display())),
    });

    Ok(java_exec)
}

pub fn download_server_core_with_progress<F>(
    instance_id: &str,
    instance_dir: &Path,
    server_type: &str,
    version: &str,
    include_java: bool,
    mut on_progress: F,
) -> DownloadTaskResult<DownloadResult>
where
    F: FnMut(DownloadProgress),
{
    let client = Client::builder()
        .user_agent("amethyst-server-launcher/0.1")
        .build()
        .map_err(|err| format_error("failed to build http client", err))?;

    let source_url = resolve_download_url(&client, server_type, version)?;
    fs::create_dir_all(instance_dir).map_err(|err| format_error("failed to ensure instance dir", err))?;

    let output_path = instance_dir.join("server.jar");
    let (total_size, supports_range) = probe_download_capabilities(&client, &source_url);

    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: "server-core".to_string(),
        downloaded_bytes: 0,
        total_bytes: total_size,
        percent: 0.0,
        bytes_per_second: 0.0,
        status: "starting".to_string(),
        message: Some("准备下载服务端核心".to_string()),
    });

    let bytes_written = if supports_range {
        if let Some(length) = total_size {
            if length >= 10 * 1024 * 1024 {
                parallel_download(
                    &client,
                    instance_id,
                    "server-core",
                    &source_url,
                    &output_path,
                    length,
                    &mut on_progress,
                )?
            } else {
                single_download(
                    &client,
                    instance_id,
                    "server-core",
                    &source_url,
                    &output_path,
                    total_size,
                    "下载服务端核心中",
                    &mut on_progress,
                )?
            }
        } else {
            single_download(
                &client,
                instance_id,
                "server-core",
                &source_url,
                &output_path,
                total_size,
                "下载服务端核心中",
                &mut on_progress,
            )?
        }
    } else {
        single_download(
            &client,
            instance_id,
            "server-core",
            &source_url,
            &output_path,
            total_size,
            "下载服务端核心中",
            &mut on_progress,
        )?
    };

    validate_server_jar(&output_path, bytes_written)?;

    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: "server-core".to_string(),
        downloaded_bytes: bytes_written,
        total_bytes: total_size,
        percent: 100.0,
        bytes_per_second: 0.0,
        status: "completed".to_string(),
        message: Some("服务端核心下载完成".to_string()),
    });

    let mut java_downloaded = false;
    let mut java_executable_path = None;

    if include_java {
        let java_major = recommended_java_major(version);
        on_progress(DownloadProgress {
            instance_id: instance_id.to_string(),
            item: "java-runtime".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            percent: 0.0,
            bytes_per_second: 0.0,
            status: "starting".to_string(),
            message: Some(format!("准备下载 Java {java_major} 运行时到 runtime/java")),
        });

        let java_exec = download_java_runtime(
            &client,
            instance_id,
            instance_dir,
            java_major,
            &mut on_progress,
        )?;
        java_downloaded = true;
        java_executable_path = Some(java_exec.to_string_lossy().to_string());

        on_progress(DownloadProgress {
            instance_id: instance_id.to_string(),
            item: "java-runtime".to_string(),
            downloaded_bytes: 1,
            total_bytes: Some(1),
            percent: 100.0,
            bytes_per_second: 0.0,
            status: "completed".to_string(),
            message: Some(format!("Java 运行时下载并解压完成: {}", java_exec.display())),
        });
    }

    Ok(DownloadResult {
        instance_id: instance_id.to_string(),
        server_type: server_type.to_string(),
        version: version.to_string(),
        source_url,
        output_path: output_path.to_string_lossy().to_string(),
        bytes_written,
        java_downloaded,
        java_executable_path,
    })
}

fn single_download<F>(
    client: &Client,
    instance_id: &str,
    item: &str,
    source_url: &str,
    output_path: &Path,
    total_size: Option<u64>,
    label: &str,
    on_progress: &mut F,
) -> DownloadTaskResult<u64>
where
    F: FnMut(DownloadProgress),
{
    let mut response = client
        .get(source_url)
        .send()
        .map_err(|err| format_error("failed to request download", err))?;

    if !response.status().is_success() {
        return Err(format!(
            "download failed with status {} from {}",
            response.status(),
            source_url
        ));
    }

    let discovered_total = response.content_length();
    let mut effective_total = total_size.or(discovered_total);

    // 如果仍未获得大小，进行一次追加探测
    if effective_total.is_none() {
        effective_total = try_get_content_length(client, source_url);
    }

    // 立即报告当前已知的总大小（即使为 None）
    if effective_total.is_some() {
        on_progress(DownloadProgress {
            instance_id: instance_id.to_string(),
            item: item.to_string(),
            downloaded_bytes: 0,
            total_bytes: effective_total,
            percent: 0.0,
            bytes_per_second: 0.0,
            status: "downloading".to_string(),
            message: Some(label.to_string()),
        });
    }

    let mut output_file = File::create(output_path).map_err(|err| format_error("failed to create output file", err))?;

    let mut downloaded = 0u64;
    let mut buffer = vec![0u8; 256 * 1024];
    let mut last_report_time = Instant::now();
    let mut last_reported_bytes = 0u64;
    let mut report_on_next = true;

    loop {
        let read_bytes = response
            .read(&mut buffer)
            .map_err(|err| format_error("failed to read response", err))?;
        if read_bytes == 0 {
            break;
        }

        output_file
            .write_all(&buffer[..read_bytes])
            .map_err(|err| format_error("failed to write output file", err))?;

        downloaded += read_bytes as u64;

        let now = Instant::now();
        let elapsed = now.duration_since(last_report_time);
        if elapsed < Duration::from_millis(80) && !report_on_next {
            continue;
        }

        let delta = downloaded.saturating_sub(last_reported_bytes);
        let speed = bytes_per_second(delta, elapsed);
        let percent = progress_percent(downloaded, effective_total);

        on_progress(DownloadProgress {
            instance_id: instance_id.to_string(),
            item: item.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: effective_total,
            percent,
            bytes_per_second: speed,
            status: "downloading".to_string(),
            message: Some(label.to_string()),
        });

        last_report_time = now;
        last_reported_bytes = downloaded;
        report_on_next = false;
    }

    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: item.to_string(),
        downloaded_bytes: downloaded,
        total_bytes: effective_total,
        percent: progress_percent(downloaded, effective_total),
        bytes_per_second: 0.0,
        status: "downloading".to_string(),
        message: Some(label.to_string()),
    });

    Ok(downloaded)
}

fn try_get_content_length(client: &Client, source_url: &str) -> Option<u64> {
    // 先尝试 HEAD 请求
    if let Ok(head_resp) = client.head(source_url).send() {
        if let Some(len) = head_resp.content_length() {
            return Some(len);
        }
    }

    // 再尝试 Range 探测
    if let Ok(range_resp) = client
        .get(source_url)
        .header(reqwest::header::RANGE, "bytes=0-0")
        .send()
    {
        if range_resp.status().as_u16() == 206 {
            if let Some(content_range) = range_resp.headers().get(reqwest::header::CONTENT_RANGE) {
                if let Ok(cr_str) = content_range.to_str() {
                    if let Some(total) = parse_content_range_total(cr_str) {
                        return Some(total);
                    }
                }
            }
        } else if let Some(len) = range_resp.content_length() {
            return Some(len);
        }
    }

    None
}

fn parallel_download<F>(
    client: &Client,
    instance_id: &str,
    item: &str,
    source_url: &str,
    output_path: &Path,
    total_size: u64,
    on_progress: &mut F,
) -> DownloadTaskResult<u64>
where
    F: FnMut(DownloadProgress),
{
    let chunk_target = 8 * 1024 * 1024;
    let estimated_threads = (total_size / chunk_target).clamp(2, 8) as usize;
    let thread_count = estimated_threads.max(2);

    let part_size = total_size.div_ceil(thread_count as u64);
    let temp_dir = output_path.with_extension("parts");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|err| format_error("failed to cleanup stale parts dir", err))?;
    }
    fs::create_dir_all(&temp_dir).map_err(|err| format_error("failed to create parts dir", err))?;

    let downloaded = Arc::new(AtomicU64::new(0));
    let (result_tx, result_rx) = mpsc::channel::<DownloadTaskResult<()>>();
    let (progress_tx, progress_rx) = mpsc::channel::<u64>();
    let mut handles = Vec::with_capacity(thread_count);
    let mut active_threads = 0usize;

    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: item.to_string(),
        downloaded_bytes: 0,
        total_bytes: Some(total_size),
        percent: 0.0,
        bytes_per_second: 0.0,
        status: "downloading".to_string(),
        message: Some(format!("并行下载中 ({thread_count} 线程)")),
    });

    for idx in 0..thread_count {
        let start = idx as u64 * part_size;
        if start >= total_size {
            break;
        }
        let end = ((idx as u64 + 1) * part_size).min(total_size) - 1;

        let part_path = temp_dir.join(format!("part-{idx:02}.bin"));
        let result_tx = result_tx.clone();
        let progress_tx = progress_tx.clone();
        let downloaded_counter = Arc::clone(&downloaded);
        let url = source_url.to_string();
        let client = client.clone();
        active_threads += 1;

        handles.push(thread::spawn(move || {
            let result = download_range_part(
                &client,
                &url,
                start,
                end,
                &part_path,
                downloaded_counter,
                progress_tx,
            );
            let _ = result_tx.send(result);
        }));
    }

    drop(result_tx);
    drop(progress_tx);

    let mut completed_threads = 0usize;
    let mut last_report_time = Instant::now();
    let mut last_reported_bytes = 0u64;

    while completed_threads < active_threads {
        // 消费通道中所有待处理的消息（flush）
        while progress_rx.try_recv().is_ok() {}

        // 定期报告进度，即使没有新消息
        let done = downloaded.load(Ordering::Relaxed).min(total_size);
        let now = Instant::now();
        let elapsed = now.duration_since(last_report_time);

        // 定期更新，或者进度有显著变化时更新
        if elapsed >= Duration::from_millis(80) {
            let speed = bytes_per_second(done.saturating_sub(last_reported_bytes), elapsed);

            on_progress(DownloadProgress {
                instance_id: instance_id.to_string(),
                item: item.to_string(),
                downloaded_bytes: done,
                total_bytes: Some(total_size),
                percent: progress_percent(done, Some(total_size)),
                bytes_per_second: speed,
                status: "downloading".to_string(),
                message: Some("并行分片下载中".to_string()),
            });

            last_report_time = now;
            last_reported_bytes = done;
        }

        match result_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(result) => {
                result?;
                completed_threads += 1;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    for handle in handles {
        handle
            .join()
            .map_err(|_| "download worker thread panicked".to_string())?;
    }

    let mut output = File::create(output_path).map_err(|err| format_error("failed to create output file", err))?;

    for idx in 0..thread_count {
        let part_path = temp_dir.join(format!("part-{idx:02}.bin"));
        if !part_path.exists() {
            continue;
        }
        let mut part = File::open(&part_path).map_err(|err| format_error("failed to open part file", err))?;
        copy(&mut part, &mut output).map_err(|err| format_error("failed to merge part file", err))?;
    }

    fs::remove_dir_all(&temp_dir).map_err(|err| format_error("failed to cleanup parts dir", err))?;

    Ok(downloaded.load(Ordering::Relaxed))
}

fn download_range_part(
    client: &Client,
    source_url: &str,
    start: u64,
    end: u64,
    part_path: &Path,
    downloaded_counter: Arc<AtomicU64>,
    progress_tx: mpsc::Sender<u64>,
) -> DownloadTaskResult<()> {
    let mut response = client
        .get(source_url)
        .header(reqwest::header::RANGE, format!("bytes={start}-{end}"))
        .send()
        .map_err(|err| format_error(&format!("failed to request range [{start}-{end}]"), err))?;

    if !(response.status().is_success() || response.status().as_u16() == 206) {
        return Err(format!(
            "range request [{start}-{end}] failed with status {}",
            response.status()
        ));
    }

    let mut file = File::create(part_path).map_err(|err| format_error("failed to create part file", err))?;
    let mut buffer = vec![0u8; 256 * 1024];

    loop {
        let read_bytes = response
            .read(&mut buffer)
            .map_err(|err| format_error("failed to read part response", err))?;
        if read_bytes == 0 {
            break;
        }

        file.write_all(&buffer[..read_bytes])
            .map_err(|err| format_error("failed to write part file", err))?;
        downloaded_counter.fetch_add(read_bytes as u64, Ordering::Relaxed);
        let _ = progress_tx.send(read_bytes as u64);
    }

    Ok(())
}

fn download_java_runtime<F>(
    client: &Client,
    instance_id: &str,
    instance_dir: &Path,
    java_major: u32,
    on_progress: &mut F,
) -> DownloadTaskResult<PathBuf>
where
    F: FnMut(DownloadProgress),
{
    let os = if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };

    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x64"
    };

    let ext = if cfg!(target_os = "windows") { "zip" } else { "tar.gz" };
    let java_url = format!(
        "https://api.adoptium.net/v3/binary/latest/{java_major}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse"
    );

    let runtime_dir = instance_dir.join("runtime");
    fs::create_dir_all(&runtime_dir).map_err(|err| format_error("failed to create runtime dir", err))?;

    let archive_path = runtime_dir.join(format!("java-runtime.{ext}"));
    single_download(
        client,
        instance_id,
        "java-runtime",
        &java_url,
        &archive_path,
        None,
        "下载 Java 运行时中",
        on_progress,
    )?;

    on_progress(DownloadProgress {
        instance_id: instance_id.to_string(),
        item: "java-runtime".to_string(),
        downloaded_bytes: 1,
        total_bytes: Some(1),
        percent: 100.0,
        bytes_per_second: 0.0,
        status: "extracting".to_string(),
        message: Some("解压 Java 运行时中".to_string()),
    });

    let java_root = runtime_dir.join("java");
    if java_root.exists() {
        fs::remove_dir_all(&java_root).map_err(|err| format_error("failed to cleanup old java runtime", err))?;
    }
    fs::create_dir_all(&java_root).map_err(|err| format_error("failed to create java root", err))?;

    if cfg!(target_os = "windows") {
        extract_zip(&archive_path, &java_root)?;
    } else {
        extract_tar_gz(&archive_path, &java_root)?;
    }

    // 解压成功后清理归档包，避免占用额外磁盘空间。
    // 清理失败不应中断主流程（Java 已可用）。
    let _ = fs::remove_file(&archive_path);

    let java_exec = find_java_executable(&java_root)
        .ok_or_else(|| "java executable not found after extraction".to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&java_exec)
            .map_err(|err| format_error("failed to stat java executable", err))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&java_exec, perms)
            .map_err(|err| format_error("failed to chmod java executable", err))?;
    }

    Ok(java_exec)
}

fn extract_tar_gz(archive_path: &Path, target_dir: &Path) -> DownloadTaskResult<()> {
    let file = File::open(archive_path).map_err(|err| format_error("failed to open tar.gz archive", err))?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut archive = tar::Archive::new(gz);
    archive
        .unpack(target_dir)
        .map_err(|err| format_error("failed to extract tar.gz", err))?;
    Ok(())
}

fn extract_zip(archive_path: &Path, target_dir: &Path) -> DownloadTaskResult<()> {
    let file = File::open(archive_path).map_err(|err| format_error("failed to open zip archive", err))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|err| format_error("failed to parse zip archive", err))?;

    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|err| format_error("failed to read zip entry", err))?;

        let entry_name = match entry.enclosed_name() {
            Some(path) => path.to_path_buf(),
            None => continue,
        };

        let out_path = target_dir.join(entry_name);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|err| format_error("failed to create zip dir", err))?;
            continue;
        }

        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|err| format_error("failed to create zip parent", err))?;
        }

        let mut out_file = File::create(&out_path).map_err(|err| format_error("failed to create zip output", err))?;
        copy(&mut entry, &mut out_file).map_err(|err| format_error("failed to extract zip file", err))?;
    }

    Ok(())
}

fn find_java_executable(root: &Path) -> Option<PathBuf> {
    let target_name = if cfg!(target_os = "windows") { "java.exe" } else { "java" };

    for entry in walkdir::WalkDir::new(root).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        if path.file_name().is_some_and(|name| name == target_name) {
            return Some(path.to_path_buf());
        }
    }

    None
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

fn progress_percent(downloaded: u64, total: Option<u64>) -> f64 {
    match total {
        Some(0) | None => 0.0,
        Some(total_bytes) => ((downloaded as f64 / total_bytes as f64) * 100.0).clamp(0.0, 100.0),
    }
}

fn bytes_per_second(delta_bytes: u64, elapsed: Duration) -> f64 {
    let seconds = elapsed.as_secs_f64();
    if seconds <= f64::EPSILON {
        return 0.0;
    }
    delta_bytes as f64 / seconds
}

fn probe_download_capabilities(client: &Client, source_url: &str) -> (Option<u64>, bool) {
    let mut total_size: Option<u64> = None;
    let mut supports_range = false;

    if let Ok(head) = client.head(source_url).send() {
        total_size = head
            .headers()
            .get(reqwest::header::CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());

        supports_range = head
            .headers()
            .get(reqwest::header::ACCEPT_RANGES)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.eq_ignore_ascii_case("bytes"))
            .unwrap_or(false);
    }

    if total_size.is_none() {
        if let Ok(probe) = client
            .get(source_url)
            .header(reqwest::header::RANGE, "bytes=0-0")
            .send()
        {
            if probe.status().as_u16() == 206 {
                supports_range = true;
                total_size = probe
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|value| value.to_str().ok())
                    .and_then(parse_content_range_total);
            }

            if total_size.is_none() {
                total_size = probe.content_length();
            }
        }
    }

    (total_size, supports_range)
}

fn parse_content_range_total(value: &str) -> Option<u64> {
    let (_, total) = value.split_once('/')?;
    total.parse::<u64>().ok()
}

fn resolve_download_url(client: &Client, server_type: &str, version: &str) -> DownloadTaskResult<String> {
    match server_type.to_ascii_lowercase().as_str() {
        "paper" => resolve_paper_url(client, version),
        "purpur" => Ok(format!("https://api.purpurmc.org/v2/purpur/{version}/latest/download")),
        "fabric" => Ok(format!(
            "https://meta.fabricmc.net/v2/versions/loader/{version}/0.16.10/1.0.1/server/jar"
        )),
        "vanilla" => resolve_vanilla_url(client, version),
        "forge" => Err("E_CORE_SOURCE_UNSUPPORTED::Forge 需要安装器流程，暂不支持直接下载 server.jar。".to_string()),
        "mohist" | "arclight" => {
            Err("E_CORE_SOURCE_UNSUPPORTED::该混合核心暂未接入自动下载源，请先手动放置 server.jar。".to_string())
        }
        _ => Err(format!("E_CORE_SOURCE_UNSUPPORTED::unsupported server type for auto-download: {server_type}")),
    }
}

fn validate_server_jar(output_path: &Path, bytes_written: u64) -> DownloadTaskResult<()> {
    if bytes_written < 1024 {
        let _ = fs::remove_file(output_path);
        return Err("E_CORE_VALIDATION::下载完成但核心文件过小，疑似无效文件。".to_string());
    }

    let mut file = File::open(output_path).map_err(|err| format_error("failed to open downloaded server jar", err))?;
    let mut magic = [0u8; 4];
    file.read_exact(&mut magic)
        .map_err(|err| format_error("failed to read downloaded server jar header", err))?;

    if magic[0] != b'P' || magic[1] != b'K' {
        let _ = fs::remove_file(output_path);
        return Err("E_CORE_VALIDATION::下载完成但文件不是有效的 JAR/ZIP 格式。".to_string());
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
struct PaperBuildsResponse {
    builds: Vec<PaperBuild>,
}

#[derive(Debug, Deserialize)]
struct PaperBuild {
    build: u32,
}

fn resolve_paper_url(client: &Client, version: &str) -> DownloadTaskResult<String> {
    let builds_url = format!("https://api.papermc.io/v2/projects/paper/versions/{version}/builds");
    let response = client
        .get(&builds_url)
        .send()
        .map_err(|err| format_error("failed to query paper builds", err))?;

    if !response.status().is_success() {
        return Err(format!("paper builds endpoint returned {}", response.status()));
    }

    let builds: PaperBuildsResponse = response
        .json()
        .map_err(|err| format_error("failed to parse paper builds response", err))?;

    let latest_build = builds
        .builds
        .last()
        .map(|build| build.build)
        .ok_or_else(|| format!("no Paper build found for version {version}"))?;

    Ok(format!(
        "https://api.papermc.io/v2/projects/paper/versions/{version}/builds/{latest_build}/downloads/paper-{version}-{latest_build}.jar"
    ))
}

#[derive(Debug, Deserialize)]
struct MojangVersionManifest {
    versions: Vec<MojangVersionEntry>,
}

#[derive(Debug, Deserialize)]
struct MojangVersionEntry {
    id: String,
    url: String,
}

#[derive(Debug, Deserialize)]
struct MojangVersionDetail {
    downloads: MojangVersionDownloads,
}

#[derive(Debug, Deserialize)]
struct MojangVersionDownloads {
    server: Option<MojangServerDownload>,
}

#[derive(Debug, Deserialize)]
struct MojangServerDownload {
    url: String,
}

fn resolve_vanilla_url(client: &Client, version: &str) -> DownloadTaskResult<String> {
    let manifest_url = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
    let manifest_response = client
        .get(manifest_url)
        .send()
        .map_err(|err| format_error("failed to request mojang manifest", err))?;

    if !manifest_response.status().is_success() {
        return Err(format!(
            "mojang manifest endpoint returned {}",
            manifest_response.status()
        ));
    }

    let manifest: MojangVersionManifest = manifest_response
        .json()
        .map_err(|err| format_error("failed to parse mojang manifest", err))?;

    let detail_url = manifest
        .versions
        .into_iter()
        .find(|entry| entry.id == version)
        .map(|entry| entry.url)
        .ok_or_else(|| format!("minecraft version not found: {version}"))?;

    let detail_response = client
        .get(detail_url)
        .send()
        .map_err(|err| format_error("failed to request version detail", err))?;

    if !detail_response.status().is_success() {
        return Err(format!(
            "version detail endpoint returned {}",
            detail_response.status()
        ));
    }

    let detail: MojangVersionDetail = detail_response
        .json()
        .map_err(|err| format_error("failed to parse version detail", err))?;

    detail
        .downloads
        .server
        .map(|download| download.url)
        .ok_or_else(|| format!("version {version} does not provide a server jar"))
}
