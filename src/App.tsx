import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";
import { LauncherTopBar } from "./components";
import { FirstRunGuideModal } from "./components/FirstRunGuideModal";
import { HomePage } from "./pages/HomePage";
import { InstancesPage } from "./pages/InstancesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useSystemResourceMonitor } from "./features/systemResource";
import { useAppSettings } from "./features/appSettings";
import { checkForLauncherUpdates } from "./features/updateCheck";
import { useI18n } from "./i18n";

type AppView = "home" | "instances" | "settings";
const FIRST_RUN_GUIDE_DISMISSED_KEY = "asl-first-run-guide-dismissed-v1";

type InstanceViewIntentType = "none" | "create" | "downloads" | "open-console";

interface InstanceViewIntent {
  type: InstanceViewIntentType;
  instanceId?: string;
  nonce: number;
}

type ToastTone = "success" | "error" | "info" | "danger";

interface NotifyPayload {
  tone: ToastTone;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

function ToastStatusIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
        <path
          d="m8.2 12.2 2.35 2.35 5.25-5.25"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (tone === "error" || tone === "danger") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.3v6.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="12" cy="16.9" r="1.1" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 10.6V16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="12" cy="7.4" r="1.1" fill="currentColor" />
    </svg>
  );
}

type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";

function detectPlatform(): DesktopPlatform {
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes("mac") || userAgent.includes("darwin")) {
    return "macos";
  }

  if (userAgent.includes("win")) {
    return "windows";
  }

  if (userAgent.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "").trim();
  const full = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return [255, 159, 67];
  }

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function resolveBackgroundLayers(preset: "aurora" | "sunset" | "forest" | "midnight") {
  if (preset === "sunset") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(255, 140, 112, 0.26), transparent 28%)",
      layer2: "radial-gradient(circle at bottom right, rgba(255, 94, 156, 0.24), transparent 36%)",
      layer3: "linear-gradient(180deg, #1a1218 0%, #0f0c13 100%)",
    };
  }

  if (preset === "forest") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(78, 189, 120, 0.24), transparent 30%)",
      layer2: "radial-gradient(circle at bottom right, rgba(24, 153, 123, 0.2), transparent 35%)",
      layer3: "linear-gradient(180deg, #0f1918 0%, #09110f 100%)",
    };
  }

  if (preset === "midnight") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(106, 131, 255, 0.22), transparent 28%)",
      layer2: "radial-gradient(circle at bottom right, rgba(59, 88, 215, 0.24), transparent 34%)",
      layer3: "linear-gradient(180deg, #0d1120 0%, #080b15 100%)",
    };
  }

  return {
    layer1: "radial-gradient(circle at top left, rgba(255, 170, 90, 0.22), transparent 28%)",
    layer2: "radial-gradient(circle at bottom right, rgba(62, 92, 255, 0.2), transparent 34%)",
    layer3: "linear-gradient(180deg, #12151d 0%, #0b0f15 100%)",
  };
}

function App() {
  const { t } = useI18n();
  const [activeView, setActiveView] = useState<AppView>("home");
  const [instanceViewIntent, setInstanceViewIntent] = useState<InstanceViewIntent>({ type: "none", nonce: 0 });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [resourceRefreshIntervalMs, setResourceRefreshIntervalMs] = useState(2000);
  const [showFirstRunGuide, setShowFirstRunGuide] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [appSettings] = useAppSettings();
  const [viewTransition, setViewTransition] = useState<{
    from: AppView;
    to: AppView;
    direction: "forward" | "backward";
  } | null>(null);
  const systemResources = useSystemResourceMonitor(resourceRefreshIntervalMs);
  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(FIRST_RUN_GUIDE_DISMISSED_KEY) === "1";
    if (!dismissed) {
      setShowFirstRunGuide(true);
    }
  }, []);

  const runUpdateCheck = async (manual: boolean) => {
    if (checkingUpdates) {
      return;
    }

    setCheckingUpdates(true);
    try {
      const result = await checkForLauncherUpdates(appSettings.about.updateChannel);
      if (result.available) {
        notify({
          tone: "info",
          title: t("app.update.found", { version: result.latestVersion }),
          detail: t("app.update.detail", { current: result.currentVersion, channel: result.channel.toUpperCase() }),
          actionLabel: t("app.update.openRelease"),
          durationMs: 8000,
          onAction: () => {
            void openUrl(result.releaseUrl);
          },
        });
        return;
      }

      if (manual) {
        notify({
          tone: "success",
          title: t("app.update.latest"),
          detail: t("app.update.detail", { current: result.currentVersion, channel: result.channel.toUpperCase() }),
        });
      }
    } catch (error) {
      const detail = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
      if (manual) {
        notify({ tone: "error", title: t("app.update.failed"), detail });
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    if (!appSettings.about.autoCheckUpdates) {
      return;
    }

    void runUpdateCheck(false);
  }, [appSettings.about.autoCheckUpdates, appSettings.about.updateChannel]);

  useEffect(() => {
    const root = document.documentElement;
    const [red, green, blue] = hexToRgb(appSettings.personalization.themeColor);
    const accent = `rgb(${red}, ${green}, ${blue})`;
    const accentSoft = `rgb(${clamp(red + 36, 0, 255)}, ${clamp(green - 10, 0, 255)}, ${clamp(blue + 42, 0, 255)})`;
    const layers = resolveBackgroundLayers(appSettings.personalization.backgroundPreset);

    root.style.setProperty("--theme-accent", accent);
    root.style.setProperty("--theme-accent-soft", accentSoft);
    root.style.setProperty("--theme-accent-rgb", `${red}, ${green}, ${blue}`);
    root.style.setProperty("--app-bg-layer-1", layers.layer1);
    root.style.setProperty("--app-bg-layer-2", layers.layer2);
    root.style.setProperty("--app-bg-layer-3", layers.layer3);

    const imageUrl = appSettings.personalization.backgroundImageUrl.trim();
    if (imageUrl) {
      const escaped = imageUrl.replace(/"/g, '\\"');
      root.style.setProperty(
        "--app-user-bg-image",
        `linear-gradient(180deg, rgba(8, 10, 16, 0.56), rgba(8, 10, 16, 0.66)), url("${escaped}") center / cover no-repeat fixed`,
      );
    } else {
      root.style.setProperty("--app-user-bg-image", "none");
    }
  }, [appSettings.personalization.backgroundPreset, appSettings.personalization.backgroundImageUrl, appSettings.personalization.themeColor]);

  const viewOrder: Record<AppView, number> = {
    home: 0,
    instances: 1,
    settings: 2,
  };

  const renderView = (view: AppView) => {
    if (view === "home") {
      return (
        <HomePage
          systemResources={systemResources}
          resourceRefreshIntervalMs={resourceRefreshIntervalMs}
          onResourceRefreshIntervalChange={setResourceRefreshIntervalMs}
          onOpenInstances={openInstancesWithIntent}
          onNotify={notify}
        />
      );
    }

    if (view === "instances") {
      return <InstancesPage intent={instanceViewIntent} onNotify={notify} />;
    }

    return (
      <SettingsPage
        onOpenFirstRunGuide={() => setShowFirstRunGuide(true)}
        checkingUpdates={checkingUpdates}
        onCheckUpdates={() => runUpdateCheck(true)}
      />
    );
  };

  const changeActiveView = (nextView: AppView) => {
    if (nextView === activeView) {
      return;
    }

    const direction = viewOrder[nextView] >= viewOrder[activeView] ? "forward" : "backward";
    setViewTransition({ from: activeView, to: nextView, direction });
    setActiveView(nextView);

    window.setTimeout(() => {
      setViewTransition((current) => (current?.to === nextView ? null : current));
    }, 480);
  };

  const openInstancesWithIntent = (intent: InstanceViewIntentType, instanceId?: string) => {
    setInstanceViewIntent((prev) => ({ type: intent, instanceId, nonce: prev.nonce + 1 }));
    changeActiveView("instances");
  };

  const notify = ({ tone, title, detail, actionLabel, onAction, durationMs = 3000 }: NotifyPayload) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-4), { id, tone, title, detail, actionLabel, onAction }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, durationMs);
  };

  return (
    <div className="app-shell">
      <main className="content">
        <LauncherTopBar
          platform={platform}
          activeView={activeView}
          onActiveViewChange={changeActiveView}
        />

        <div className="view-frame">
          {viewTransition && (
            <div className={`view-panel outgoing ${viewTransition.direction}`} key={`out-${viewTransition.from}`}>
              {renderView(viewTransition.from)}
            </div>
          )}

          <div
            className={`view-panel current ${
              viewTransition ? `incoming ${viewTransition.direction}` : "stable"
            }`}
            key={`current-${activeView}`}
          >
            {renderView(activeView)}
          </div>
        </div>

        <div className="toast-stack" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <div className={`toast-item ${toast.tone}`} key={toast.id} role="status">
              <span className="toast-icon" aria-hidden="true">
                <ToastStatusIcon tone={toast.tone} />
              </span>
              <span className="toast-content">
                <span className="toast-title">{toast.title}</span>
                {toast.detail && <span className="toast-text">{toast.detail}</span>}
              </span>
              {toast.actionLabel && (
                <button
                  className="toast-action"
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    setToasts((prev) => prev.filter((item) => item.id !== toast.id));
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>

        <FirstRunGuideModal
          open={showFirstRunGuide}
          onClose={() => setShowFirstRunGuide(false)}
          onDoNotShowAgain={() => {
            window.localStorage.setItem(FIRST_RUN_GUIDE_DISMISSED_KEY, "1");
            setShowFirstRunGuide(false);
            notify({ tone: "success", title: t("app.firstRun.saved"), detail: t("app.firstRun.savedDetail") });
          }}
          onCreateInstance={() => {
            setShowFirstRunGuide(false);
            openInstancesWithIntent("create");
          }}
          onOpenDownloads={() => {
            setShowFirstRunGuide(false);
            openInstancesWithIntent("downloads");
          }}
          onOpenSettings={() => {
            setShowFirstRunGuide(false);
            changeActiveView("settings");
          }}
        />
      </main>
    </div>
  );
}

export default App;
