import { WindowControls } from "./WindowControls";
import { getTranslation, defaultLocale } from "../i18n";
import type { SystemResourceSnapshot } from "../features/systemResource";
import { formatBytes, formatPercent } from "../features/systemResource";

interface LauncherTopBarProps {
  platform: "macos" | "windows" | "linux" | "unknown";
  activeView: "home" | "instances" | "settings";
  onActiveViewChange: (view: "home" | "instances" | "settings") => void;
  systemResources: SystemResourceSnapshot | null;
}

function ViewIcon({ view }: { view: "home" | "instances" | "settings" }) {
  if (view === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V19h11v-8.5" />
        <path d="M10 19v-5h4v5" />
      </svg>
    );
  }

  if (view === "instances") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="5" width="6.5" height="6.5" rx="1.5" />
        <rect x="4" y="14" width="6.5" height="6.5" rx="1.5" />
        <rect x="13.5" y="14" width="6.5" height="6.5" rx="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v6" />
      <path d="M12 15v6" />
      <path d="M4.9 6.9l4.2 4.2" />
      <path d="M14.9 12.9l4.2 4.2" />
      <path d="M3 12h6" />
      <path d="M15 12h6" />
      <path d="M4.9 17.1l4.2-4.2" />
      <path d="M14.9 11.1l4.2-4.2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function LauncherTopBar({
  platform,
  activeView,
  onActiveViewChange,
  systemResources,
}: LauncherTopBarProps) {
  const t = getTranslation(defaultLocale, "launcherName");
  const cpuValue = systemResources ? formatPercent(systemResources.cpuUsage) : "--";
  const memoryValue = systemResources
    ? `${formatBytes(systemResources.memoryUsed)} / ${formatBytes(systemResources.memoryTotal)}`
    : "--";
  const diskValue = systemResources
    ? `${formatPercent(systemResources.diskTotal > 0 ? (systemResources.diskUsed / systemResources.diskTotal) * 100 : 0)}`
    : "--";

  return (
    <header className={`topbar ${platform}`} data-tauri-drag-region>
      <div className="topbar-left">
        <div className="brand-block compact">
          <div className="brand-mark">A</div>
          <div>
            <p className="eyebrow">Amethyst Launcher</p>
            <h1>{t}</h1>
          </div>
        </div>

        <div className="topbar-metrics">
          <span className="metric-pill">CPU {cpuValue}</span>
          <span className="metric-pill">内存 {memoryValue}</span>
          <span className="metric-pill">磁盘 {diskValue}</span>
        </div>
      </div>

      <nav className="tab-nav" aria-label="主导航">
        <button className={`tab-button ${activeView === "home" ? "active" : ""}`} type="button" onClick={() => onActiveViewChange("home")}>
          <ViewIcon view="home" />
          <span>{getTranslation(defaultLocale, "home")}</span>
        </button>
        <button className={`tab-button ${activeView === "instances" ? "active" : ""}`} type="button" onClick={() => onActiveViewChange("instances")}>
          <ViewIcon view="instances" />
          <span>{getTranslation(defaultLocale, "instances")}</span>
        </button>
        <button className={`tab-button ${activeView === "settings" ? "active" : ""}`} type="button" onClick={() => onActiveViewChange("settings")}>
          <ViewIcon view="settings" />
          <span>{getTranslation(defaultLocale, "settings")}</span>
        </button>
      </nav>

      <div className="topbar-right">
        <WindowControls platform={platform} />
      </div>
    </header>
  );
}
