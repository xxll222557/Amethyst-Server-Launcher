pub mod tauri_app;

use std::path::PathBuf;

pub fn backend_data_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "failed to resolve HOME for application data dir".to_string())?;

    #[cfg(target_os = "macos")]
    {
        return Ok(home
            .join("Library")
            .join("Application Support")
            .join("Amethyst-Server-Launcher"));
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = std::env::var_os("APPDATA") {
            return Ok(PathBuf::from(app_data).join("Amethyst-Server-Launcher"));
        }
        return Ok(home
            .join("AppData")
            .join("Roaming")
            .join("Amethyst-Server-Launcher"));
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        if let Some(xdg_data_home) = std::env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(xdg_data_home).join("amethyst-server-launcher"));
        }
        Ok(home.join(".local").join("share").join("amethyst-server-launcher"))
    }
}
