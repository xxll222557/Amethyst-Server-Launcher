#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub download_speed_limit_kbps: Option<u64>,
    pub download_timeout_secs: u64,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            download_speed_limit_kbps: None,
            download_timeout_secs: 300,
        }
    }
}
