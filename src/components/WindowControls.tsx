import { getCurrentWindow } from "@tauri-apps/api/window";

interface WindowControlsProps {
  platform: "macos" | "windows" | "linux" | "unknown";
}

export function WindowControls({ platform }: WindowControlsProps) {
  if (platform === "macos") {
    return null;
  }

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

  return (
    <div className="window-controls native" aria-label="窗口控制">
      <button className="window-native-button" aria-label="最小化" type="button" onClick={minimizeWindow}>
        <span className="window-native-icon">-</span>
      </button>
      <button className="window-native-button" aria-label="最大化" type="button" onClick={toggleWindowZoom}>
        <span className="window-native-icon square" />
      </button>
      <button className="window-native-button close" aria-label="关闭" type="button" onClick={closeWindow}>
        <span className="window-native-icon">×</span>
      </button>
    </div>
  );
}
