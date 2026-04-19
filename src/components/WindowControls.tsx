import { getCurrentWindow } from "@tauri-apps/api/window";
import { useI18n } from "../i18n";

interface WindowControlsProps {
  platform: "macos" | "windows" | "linux" | "unknown";
}

export function WindowControls({ platform }: WindowControlsProps) {
  const { t } = useI18n();

  const minimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("Failed to minimize window", error);
    }
  };

  const toggleWindowZoom = async () => {
    try {
      const appWindow = getCurrentWindow();
      const maximized = await appWindow.isMaximized();

      if (maximized) {
        await appWindow.unmaximize();
        return;
      }

      await appWindow.maximize();
    } catch (error) {
      console.error("Failed to toggle window zoom", error);
    }
  };

  const closeWindow = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("Failed to close window", error);
    }
  };

  if (platform === "macos") {
    return null;
  }

  return (
    <div className="window-controls native" aria-label={t("window.controls.aria")}>
      <button className="window-native-button" aria-label={t("window.controls.minimize")} type="button" onClick={minimizeWindow}>
        <span className="window-native-icon">-</span>
      </button>
      <button className="window-native-button" aria-label={t("window.controls.maximize")} type="button" onClick={toggleWindowZoom}>
        <span className="window-native-icon square" />
      </button>
      <button className="window-native-button close" aria-label={t("window.controls.close")} type="button" onClick={closeWindow}>
        <span className="window-native-icon">×</span>
      </button>
    </div>
  );
}
