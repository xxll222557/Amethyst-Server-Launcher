mod error;
mod app;
mod task;

pub use app::{download_core_for_instance, download_java_runtime_for_instance};
pub use task::{
	download_java_runtime_with_progress, download_server_core, download_server_core_with_progress,
	download_url_to_path_with_progress, DownloadProgress, DownloadResult,
};
