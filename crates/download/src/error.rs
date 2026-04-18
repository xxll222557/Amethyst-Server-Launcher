pub type DownloadError = String;
pub type DownloadTaskResult<T> = Result<T, DownloadError>;

pub fn format_error(context: &str, err: impl std::fmt::Display) -> DownloadError {
    format!("{context}: {err}")
}
