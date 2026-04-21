import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";
import { CrashAnalysisModal, type CrashAnalysisPayload } from "./components/CrashAnalysisModal";
import { InboxModal, type InboxEntry } from "./components/InboxModal";
import { LauncherTopBar } from "./components";
import type { DownloadTaskView } from "./components/DownloadCenter";
import { FirstRunGuideModal } from "./components/FirstRunGuideModal";
import { DownloadsPage, HomePage, InstancesPage } from "./pages";
import { MarketPage } from "./pages/MarketPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useSystemResourceMonitor } from "./features/systemResource";
import { useAppSettings } from "./features/appSettings";
import {
  downloadMarketAsset,
  exportTextFile,
  getInstanceConsoleLogs,
  parseInvokeError,
  type DownloadProgressEvent,
} from "./features/instanceService";
import { checkForLauncherUpdates } from "./features/updateCheck";
import type { TranslationKey } from "./i18n";
import { useI18n } from "./i18n";

type AppView = "home" | "instances" | "market" | "downloads" | "settings";
const FIRST_RUN_GUIDE_DISMISSED_KEY = "asl-first-run-guide-dismissed-v1";
const DOWNLOAD_TASKS_STORAGE_KEY = "asl-download-tasks-v1";

type MarketQueuePayload = {
  marketItemId: string;
  itemName: string;
  version: string;
  category: "server" | "plugin" | "modpack" | "java";
  source: string;
  fileName: string;
};

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

interface CrashAnalysisEvent {
  instanceId: string;
  crashCode: string;
  summary: string;
  detail: string;
  confidence: number;
  suggestions: string[];
  logExcerpt?: string | null;
}

interface ProcessStateEvent {
  instanceId: string;
  status: string;
  message: string;
}

type InboxSource = "crash" | "notification" | "runtime";

function analyzeCrashFromLogs(logs: string[]): { crashCode: string; logExcerpt?: string } {
  const loweredLines = logs.map((line) => line.toLowerCase());

  const findByToken = (tokens: string[]) => {
    for (const token of tokens) {
      for (let i = loweredLines.length - 1; i >= 0; i -= 1) {
        if (loweredLines[i].includes(token)) {
          return logs[i];
        }
      }
    }
    return logs[logs.length - 1];
  };

  const hasAny = (tokens: string[]) => tokens.some((token) => loweredLines.some((line) => line.includes(token)));

  if (hasAny(["failed to bind to port", "address already in use", "bind failed"])) {
    return { crashCode: "E_PORT_IN_USE", logExcerpt: findByToken(["address already in use", "failed to bind to port", "bind failed"]) };
  }

  if (hasAny(["you need to agree to the eula", "eula.txt", "eula=false"])) {
    return { crashCode: "E_EULA_NOT_ACCEPTED", logExcerpt: findByToken(["you need to agree to the eula", "eula.txt", "eula=false"]) };
  }

  if (hasAny(["outofmemoryerror", "could not reserve enough space", "java heap space"])) {
    return { crashCode: "E_MEMORY_INSUFFICIENT", logExcerpt: findByToken(["outofmemoryerror", "java heap space", "could not reserve enough space"]) };
  }

  if (hasAny(["unsupportedclassversionerror", "has been compiled by a more recent version"])) {
    return { crashCode: "E_JAVA_VERSION_MISMATCH", logExcerpt: findByToken(["unsupportedclassversionerror", "compiled by a more recent version"]) };
  }

  if (hasAny(["noclassdeffounderror", "classnotfoundexception", "nosuchmethoderror", "failed to load plugin"])) {
    return { crashCode: "E_PLUGIN_OR_MOD_CONFLICT", logExcerpt: findByToken(["noclassdeffounderror", "classnotfoundexception", "nosuchmethoderror", "failed to load plugin"]) };
  }

  return { crashCode: "E_UNKNOWN_CRASH", logExcerpt: logs[logs.length - 1] };
}

function resolveCrashCopy(
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
  crashCode: string,
) {
  if (crashCode === "E_PORT_IN_USE") {
    return {
      summary: t("crashReason.E_PORT_IN_USE.summary"),
      detail: t("crashReason.E_PORT_IN_USE.detail"),
      suggestion: t("crashReason.E_PORT_IN_USE.suggestion"),
    };
  }

  if (crashCode === "E_EULA_NOT_ACCEPTED") {
    return {
      summary: t("crashReason.E_EULA_NOT_ACCEPTED.summary"),
      detail: t("crashReason.E_EULA_NOT_ACCEPTED.detail"),
      suggestion: t("crashReason.E_EULA_NOT_ACCEPTED.suggestion"),
    };
  }

  if (crashCode === "E_MEMORY_INSUFFICIENT") {
    return {
      summary: t("crashReason.E_MEMORY_INSUFFICIENT.summary"),
      detail: t("crashReason.E_MEMORY_INSUFFICIENT.detail"),
      suggestion: t("crashReason.E_MEMORY_INSUFFICIENT.suggestion"),
    };
  }

  if (crashCode === "E_JAVA_VERSION_MISMATCH") {
    return {
      summary: t("crashReason.E_JAVA_VERSION_MISMATCH.summary"),
      detail: t("crashReason.E_JAVA_VERSION_MISMATCH.detail"),
      suggestion: t("crashReason.E_JAVA_VERSION_MISMATCH.suggestion"),
    };
  }

  if (crashCode === "E_PLUGIN_OR_MOD_CONFLICT") {
    return {
      summary: t("crashReason.E_PLUGIN_OR_MOD_CONFLICT.summary"),
      detail: t("crashReason.E_PLUGIN_OR_MOD_CONFLICT.detail"),
      suggestion: t("crashReason.E_PLUGIN_OR_MOD_CONFLICT.suggestion"),
    };
  }

  return {
    summary: t("crashReason.E_UNKNOWN_CRASH.summary"),
    detail: t("crashReason.E_UNKNOWN_CRASH.detail"),
    suggestion: t("crashReason.E_UNKNOWN_CRASH.suggestion"),
  };
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

function formatSpeedText(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "0 B/s";
  }

  if (bytesPerSecond >= 1024 * 1024) {
    return `${(bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`;
  }

  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }

  return `${Math.round(bytesPerSecond)} B/s`;
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

function parseStoredDownloadTasks(raw: string | null): DownloadTaskView[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as DownloadTaskView[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((task) => task && typeof task.id === "string" && typeof task.status === "string")
      .map((task) => {
        const wasPending = task.status === "queued" || task.status === "downloading";
        const recoverable = task.id.startsWith("market-") && typeof task.marketItemId === "string";

        if (!wasPending) {
          return task;
        }

        if (recoverable) {
          return {
            ...task,
            status: "queued",
            speedText: "0 B/s",
            message: "Recovered queued task after restart",
            updatedAt: Date.now(),
            logs: [...task.logs, `[${new Date().toLocaleTimeString()}] Recovered queued task after restart`].slice(-80),
          } satisfies DownloadTaskView;
        }

        return {
          ...task,
          status: "failed",
          speedText: "0 B/s",
          message: "Interrupted by app restart",
          updatedAt: Date.now(),
          logs: [...task.logs, `[${new Date().toLocaleTimeString()}] Interrupted by app restart`].slice(-80),
        } satisfies DownloadTaskView;
      });
  } catch {
    return [];
  }
}

function mapMarketDownloadError(code: string | undefined, fallback: string, t: ReturnType<typeof useI18n>["t"]) {
  if (code === "ASL_MARKET_ITEM_NOT_FOUND") {
    return t("market.error.itemNotFound");
  }
  if (code === "ASL_MARKET_UNSUPPORTED_HOST") {
    return t("market.error.unsupportedSource");
  }
  if (code === "ASL_MARKET_INVALID_URL") {
    return t("market.error.invalidUrl");
  }
  if (code === "ASL_MARKET_INVALID_FILENAME") {
    return t("market.error.invalidFileName");
  }
  if (code === "ASL_MARKET_PATH_RESTRICTED") {
    return t("market.error.pathRestricted");
  }
  if (code === "ASL_MARKET_INVALID_REQUEST") {
    return t("market.error.invalidRequest");
  }
  if (code === "ASL_MARKET_JOIN_FAILED") {
    return t("market.error.joinFailed");
  }
  if (code === "ASL_MARKET_DOWNLOAD_FAILED") {
    return t("market.error.downloadFailed");
  }
  if (code === "ASL_MARKET_INTERNAL") {
    return t("market.error.internal");
  }

  return fallback || t("market.error.unknown");
}

function resolveBackgroundLayers(
  preset: "aurora" | "sunset" | "forest" | "midnight" | "ocean" | "dawn" | "ember" | "graphite",
  mode: "dark" | "light",
) {
  if (mode === "light") {
    if (preset === "sunset") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(255, 166, 124, 0.34), transparent 36%)",
        layer2: "radial-gradient(circle at bottom right, rgba(255, 126, 178, 0.28), transparent 40%)",
        layer3: "linear-gradient(180deg, #fff4ef 0%, #f6ebf4 100%)",
      };
    }

    if (preset === "forest") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(101, 199, 139, 0.32), transparent 36%)",
        layer2: "radial-gradient(circle at bottom right, rgba(58, 176, 141, 0.25), transparent 40%)",
        layer3: "linear-gradient(180deg, #eef8f4 0%, #e6f2ec 100%)",
      };
    }

    if (preset === "midnight") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(138, 158, 255, 0.3), transparent 35%)",
        layer2: "radial-gradient(circle at bottom right, rgba(112, 134, 242, 0.24), transparent 40%)",
        layer3: "linear-gradient(180deg, #edf1ff 0%, #e7ecff 100%)",
      };
    }

    if (preset === "ocean") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(108, 196, 255, 0.34), transparent 36%)",
        layer2: "radial-gradient(circle at bottom right, rgba(79, 149, 255, 0.24), transparent 40%)",
        layer3: "linear-gradient(180deg, #eef6ff 0%, #e7f1ff 100%)",
      };
    }

    if (preset === "dawn") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(255, 196, 134, 0.35), transparent 36%)",
        layer2: "radial-gradient(circle at bottom right, rgba(255, 150, 196, 0.25), transparent 40%)",
        layer3: "linear-gradient(180deg, #fff6ee 0%, #f9eef6 100%)",
      };
    }

    if (preset === "ember") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(255, 155, 130, 0.34), transparent 36%)",
        layer2: "radial-gradient(circle at bottom right, rgba(255, 197, 115, 0.28), transparent 40%)",
        layer3: "linear-gradient(180deg, #fff2ee 0%, #f8ece8 100%)",
      };
    }

    if (preset === "graphite") {
      return {
        layer1: "radial-gradient(circle at top left, rgba(185, 194, 214, 0.3), transparent 36%)",
        layer2: "radial-gradient(circle at bottom right, rgba(146, 160, 186, 0.22), transparent 40%)",
        layer3: "linear-gradient(180deg, #f1f4fa 0%, #e9eef7 100%)",
      };
    }

    return {
      layer1: "radial-gradient(circle at top left, rgba(255, 188, 132, 0.34), transparent 36%)",
      layer2: "radial-gradient(circle at bottom right, rgba(126, 165, 255, 0.28), transparent 40%)",
      layer3: "linear-gradient(180deg, #f4f7fd 0%, #eaf0fa 100%)",
    };
  }

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

  if (preset === "ocean") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(88, 187, 255, 0.24), transparent 30%)",
      layer2: "radial-gradient(circle at bottom right, rgba(38, 119, 242, 0.22), transparent 36%)",
      layer3: "linear-gradient(180deg, #0d1b2b 0%, #08131f 100%)",
    };
  }

  if (preset === "dawn") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(255, 186, 120, 0.26), transparent 32%)",
      layer2: "radial-gradient(circle at bottom right, rgba(255, 118, 169, 0.2), transparent 34%)",
      layer3: "linear-gradient(180deg, #2b1b21 0%, #191119 100%)",
    };
  }

  if (preset === "ember") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(255, 123, 88, 0.28), transparent 32%)",
      layer2: "radial-gradient(circle at bottom right, rgba(255, 175, 80, 0.22), transparent 35%)",
      layer3: "linear-gradient(180deg, #221214 0%, #130a0d 100%)",
    };
  }

  if (preset === "graphite") {
    return {
      layer1: "radial-gradient(circle at top left, rgba(167, 176, 196, 0.16), transparent 30%)",
      layer2: "radial-gradient(circle at bottom right, rgba(110, 124, 149, 0.16), transparent 36%)",
      layer3: "linear-gradient(180deg, #171b24 0%, #10141d 100%)",
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
  const platform = useMemo(() => detectPlatform(), []);
  const [activeView, setActiveView] = useState<AppView>("home");
  const [instanceViewIntent, setInstanceViewIntent] = useState<InstanceViewIntent>({ type: "none", nonce: 0 });
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [resourceRefreshIntervalMs, setResourceRefreshIntervalMs] = useState(
    platform === "windows" ? 3500 : 2000,
  );
  const [downloadTasks, setDownloadTasks] = useState<DownloadTaskView[]>(() =>
    parseStoredDownloadTasks(window.localStorage.getItem(DOWNLOAD_TASKS_STORAGE_KEY)),
  );
  const [showFirstRunGuide, setShowFirstRunGuide] = useState(false);
  const [crashQueue, setCrashQueue] = useState<CrashAnalysisPayload[]>([]);
  const [activeCrash, setActiveCrash] = useState<CrashAnalysisPayload | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<InboxEntry[]>([]);
  const [inboxOnlyUnread, setInboxOnlyUnread] = useState(false);
  const lastCrashFingerprintRef = useRef<Map<string, number>>(new Map());
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [appSettings, setAppSettings] = useAppSettings();
  const [viewTransition, setViewTransition] = useState<{
    from: AppView;
    to: AppView;
    direction: "forward" | "backward";
  } | null>(null);
  const systemResources = useSystemResourceMonitor(resourceRefreshIntervalMs);
  const inboxUnreadCount = useMemo(() => inboxItems.filter((item) => !item.read).length, [inboxItems]);

  const pushInbox = (entry: {
    level: InboxEntry["level"];
    title: string;
    detail?: string;
    instanceId?: string;
    source: InboxSource;
  }) => {
    const nextId = Date.now() + Math.floor(Math.random() * 1000);
    const sourceLabel =
      entry.source === "crash"
        ? t("inbox.source.crash")
        : entry.source === "runtime"
          ? t("inbox.source.runtime")
          : t("inbox.source.notification");

    setInboxItems((prev) => [
      {
        id: nextId,
        level: entry.level,
        title: entry.title,
        detail: entry.detail,
        instanceId: entry.instanceId,
        source: sourceLabel,
        createdAt: Date.now(),
        read: inboxOpen,
      },
      ...prev,
    ].slice(0, 200));
  };

  useEffect(() => {
    const dismissed = window.localStorage.getItem(FIRST_RUN_GUIDE_DISMISSED_KEY) === "1";
    if (!dismissed) {
      setShowFirstRunGuide(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DOWNLOAD_TASKS_STORAGE_KEY, JSON.stringify(downloadTasks.slice(0, 300)));
  }, [downloadTasks]);

  useEffect(() => {
    if (activeCrash || crashQueue.length === 0) {
      return;
    }

    const [next, ...rest] = crashQueue;
    setActiveCrash(next);
    setCrashQueue(rest);
  }, [activeCrash, crashQueue]);

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
    const isDarkMode = appSettings.personalization.appearanceMode === "dark";
    const [red, green, blue] = hexToRgb(appSettings.personalization.themeColor);
    const accent = `rgb(${red}, ${green}, ${blue})`;
    const accentSoft = `rgb(${clamp(red + 36, 0, 255)}, ${clamp(green - 10, 0, 255)}, ${clamp(blue + 42, 0, 255)})`;
    const layers = resolveBackgroundLayers(appSettings.personalization.backgroundPreset, isDarkMode ? "dark" : "light");

    root.classList.toggle("theme-dark", isDarkMode);
    root.classList.toggle("theme-light", !isDarkMode);
    root.style.setProperty("color-scheme", isDarkMode ? "dark" : "light");

    root.style.setProperty("--theme-accent", accent);
    root.style.setProperty("--theme-accent-soft", accentSoft);
    root.style.setProperty("--theme-accent-rgb", `${red}, ${green}, ${blue}`);
    root.style.setProperty("--app-bg-layer-1", layers.layer1);
    root.style.setProperty("--app-bg-layer-2", layers.layer2);
    root.style.setProperty("--app-bg-layer-3", layers.layer3);

    const imageUrl = appSettings.personalization.backgroundImageUrl.trim();
    if (imageUrl) {
      const escaped = imageUrl.replace(/"/g, '\\"');
      const overlay = isDarkMode
        ? "linear-gradient(180deg, rgba(8, 10, 16, 0.56), rgba(8, 10, 16, 0.66))"
        : "linear-gradient(180deg, rgba(255, 255, 255, 0.42), rgba(242, 245, 251, 0.54))";
      root.style.setProperty(
        "--app-user-bg-image",
        `${overlay}, url("${escaped}") center / cover no-repeat fixed`,
      );
    } else {
      root.style.setProperty("--app-user-bg-image", "none");
    }
  }, [
    appSettings.personalization.appearanceMode,
    appSettings.personalization.backgroundPreset,
    appSettings.personalization.backgroundImageUrl,
    appSettings.personalization.themeColor,
  ]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("platform-windows", platform === "windows");
    root.classList.toggle("platform-macos", platform === "macos");
    root.classList.toggle("platform-linux", platform === "linux");
  }, [platform]);

  const viewOrder: Record<AppView, number> = {
    home: 0,
    instances: 1,
    market: 2,
    downloads: 3,
    settings: 4,
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
      return (
        <InstancesPage
          intent={instanceViewIntent}
          onNotify={notify}
          downloadTasks={downloadTasks}
          onDownloadTasksChange={setDownloadTasks}
          onOpenDownloadsView={() => changeActiveView("downloads")}
        />
      );
    }

    if (view === "market") {
      return (
        <MarketPage
          onOpenDownloads={() => changeActiveView("downloads")}
          onQueueDownload={(payload: MarketQueuePayload) => {
            const { marketItemId, itemName, version, category, source, fileName } = payload;
            const id = `market-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const categoryLabel =
              category === "server"
                ? t("market.section.server.short")
                : category === "plugin"
                  ? t("market.section.plugin.short")
                  : category === "modpack"
                    ? t("market.section.modpack.short")
                    : t("market.section.java.short");

            const entryLabel = `${itemName} ${version}`;

            setDownloadTasks((prev) => [
              {
                id,
                instanceId: id,
                instanceName: t("market.label"),
                item: `${categoryLabel} · ${entryLabel}`,
                progress: 0,
                speedText: "0 B/s",
                status: "queued",
                message: t("market.task.queued"),
                marketItemId,
                marketCategory: category,
                fileName,
                logs: [
                  `[${new Date().toLocaleTimeString()}] ${t("market.task.logQueued", { item: entryLabel, source })}`,
                ],
                updatedAt: Date.now(),
              },
              ...prev,
            ]);

            notify({
              tone: "success",
              title: t("market.task.addedTitle"),
              detail: t("market.task.addedDetail", { item: entryLabel }),
            });

            changeActiveView("downloads");
          }}
        />
      );
    }

    if (view === "downloads") {
      return (
        <DownloadsPage
          tasks={downloadTasks}
          onRetryTask={(task) => {
            if (task.id.startsWith("market-")) {
              setDownloadTasks((prev) =>
                prev.map((item) =>
                  item.id === task.id
                    ? {
                        ...item,
                        status: "queued",
                        progress: 0,
                        speedText: "0 B/s",
                        message: t("market.task.queued"),
                        logs: [
                          ...item.logs,
                          `[${new Date().toLocaleTimeString()}] ${t("market.task.logRetry", { item: item.item })}`,
                        ].slice(-80),
                        updatedAt: Date.now(),
                      }
                    : item,
                ),
              );
              return;
            }

            changeActiveView("instances");
            openInstancesWithIntent("downloads");
          }}
        />
      );
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

    if (platform === "windows") {
      setViewTransition(null);
      setActiveView(nextView);
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

  const toggleAppearanceMode = () => {
    setAppSettings((current) => ({
      ...current,
      personalization: {
        ...current.personalization,
        appearanceMode: current.personalization.appearanceMode === "dark" ? "light" : "dark",
      },
    }));
  };

  const toggleLanguage = () => {
    setAppSettings((current) => ({
      ...current,
      about: {
        ...current.about,
        language: current.about.language === "zh-CN" ? "en-US" : "zh-CN",
      },
    }));
  };

  const notify = ({ tone, title, detail, actionLabel, onAction, durationMs = 3000 }: NotifyPayload) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev.slice(-4), { id, tone, title, detail, actionLabel, onAction }]);

    if (tone === "danger" || tone === "error") {
      pushInbox({ level: "error", title, detail, source: "notification" });
    } else if (tone === "info") {
      pushInbox({ level: "warning", title, detail, source: "notification" });
    }

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, durationMs);
  };

  const openInbox = () => {
    setInboxOpen(true);
    setInboxItems((prev) => prev.map((item) => (item.read ? item : { ...item, read: true })));
  };

  const exportInbox = async (items: InboxEntry[]) => {
    const selected = await save({
      title: t("inbox.exportDialogTitle"),
      defaultPath: `asl-inbox-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`,
      filters: [{ name: "Log", extensions: ["log", "txt"] }],
    });

    if (!selected) {
      return;
    }

    const lines = items.map((item) => {
      const ts = new Date(item.createdAt).toISOString();
      const instance = item.instanceId ? ` [instance=${item.instanceId}]` : "";
      const detail = item.detail ? `\n${item.detail}` : "";
      return `[${ts}] [${item.level.toUpperCase()}] [${item.source}]${instance} ${item.title}${detail}`;
    });

    try {
      await exportTextFile(selected, lines.join("\n\n"));
      notify({ tone: "success", title: t("inbox.exported"), detail: selected });
    } catch (error) {
      const detail = typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
      notify({ tone: "error", title: t("inbox.exportFailed"), detail });
    }
  };

  useEffect(() => {
    let active = true;

    const setup = async () => {
      const unlisten = await listen<DownloadProgressEvent>("market-download-progress", (event) => {
        if (!active || !event.payload) {
          return;
        }

        const payload = event.payload;

        setDownloadTasks((prev) =>
          prev.map((task) => {
            if (task.id !== payload.instanceId) {
              return task;
            }

            const normalizedStatus =
              payload.status === "completed"
                ? "completed"
                : payload.status === "error"
                  ? "failed"
                  : "downloading";

            return {
              ...task,
              progress: payload.totalBytes && payload.totalBytes > 0
                ? clamp(payload.percent, 0, 100)
                : payload.downloadedBytes > 0
                  ? Math.max(task.progress, 3)
                  : task.progress,
              speedText: formatSpeedText(payload.bytesPerSecond),
              status: normalizedStatus,
              message: payload.message ?? task.message,
              updatedAt: Date.now(),
            };
          }),
        );
      });

      if (!active) {
        unlisten();
      }

      return unlisten;
    };

    const unlistenPromise = setup();

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten?.());
    };
  }, []);

  useEffect(() => {
    let active = true;

    const setup = async () => {
      const unlisten = await listen<CrashAnalysisEvent>("instance-crash-analysis", (event) => {
        if (!active || !event.payload) {
          return;
        }

        const payload = event.payload;
        const fingerprint = `${payload.instanceId}:${payload.crashCode}`;
        lastCrashFingerprintRef.current.set(fingerprint, Date.now());
        const localized = resolveCrashCopy(t, payload.crashCode);
        const normalized: CrashAnalysisPayload = {
          instanceId: payload.instanceId,
          crashCode: payload.crashCode,
          summary: localized.summary,
          detail: localized.detail,
          confidence: payload.confidence,
          suggestions: [localized.suggestion || t("crashPrompt.defaultSuggestion")],
          logExcerpt: payload.logExcerpt,
        };

        setCrashQueue((prev) => [...prev.slice(-3), normalized]);
        pushInbox({
          level: "error",
          title: localized.summary,
          detail: `${localized.detail} (${payload.instanceId})`,
          instanceId: payload.instanceId,
          source: "crash",
        });
      });

      if (!active) {
        unlisten();
      }

      return unlisten;
    };

    const unlistenPromise = setup();

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten?.());
    };
  }, [t]);

  useEffect(() => {
    let active = true;

    const setup = async () => {
      const unlisten = await listen<ProcessStateEvent>("instance-process-state", (event) => {
        if (!active || !event.payload) {
          return;
        }

        const payload = event.payload;
        if (payload.status !== "stopped" && payload.status !== "error") {
          return;
        }

        void (async () => {
          try {
            const logs = await getInstanceConsoleLogs(payload.instanceId, 300);
            const result = analyzeCrashFromLogs(logs);
            if (result.crashCode === "E_UNKNOWN_CRASH") {
              return;
            }

            const fingerprint = `${payload.instanceId}:${result.crashCode}`;
            const now = Date.now();
            const lastAt = lastCrashFingerprintRef.current.get(fingerprint) ?? 0;
            if (now - lastAt < 10_000) {
              return;
            }
            lastCrashFingerprintRef.current.set(fingerprint, now);

            const localized = resolveCrashCopy(t, result.crashCode);
            const normalized: CrashAnalysisPayload = {
              instanceId: payload.instanceId,
              crashCode: result.crashCode,
              summary: localized.summary,
              detail: localized.detail,
              confidence: 88,
              suggestions: [localized.suggestion || t("crashPrompt.defaultSuggestion")],
              logExcerpt: result.logExcerpt,
            };

            setCrashQueue((prev) => [...prev.slice(-3), normalized]);
            pushInbox({
              level: "warning",
              title: localized.summary,
              detail: `${localized.detail} (${payload.instanceId})`,
              instanceId: payload.instanceId,
              source: "runtime",
            });
          } catch {
            // ignore fallback analysis errors
          }
        })();
      });

      if (!active) {
        unlisten();
      }

      return unlisten;
    };

    const unlistenPromise = setup();

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten?.());
    };
  }, [t]);

  useEffect(() => {
    const runningMarketTask = downloadTasks.find(
      (task) => task.id.startsWith("market-") && task.status === "downloading",
    );
    if (runningMarketTask) {
      return;
    }

    const nextTask = downloadTasks.find(
      (task) => task.id.startsWith("market-") && task.status === "queued" && task.marketItemId && task.fileName,
    );

    if (!nextTask || !nextTask.marketItemId || !nextTask.fileName) {
      return;
    }

    setDownloadTasks((prev) =>
      prev.map((task) =>
        task.id === nextTask.id
          ? {
              ...task,
              status: "downloading",
              message: t("market.task.running"),
              logs: [
                ...task.logs,
                `[${new Date().toLocaleTimeString()}] ${t("market.task.logStarted", { item: task.item })}`,
              ].slice(-80),
              updatedAt: Date.now(),
            }
          : task,
      ),
    );

    void downloadMarketAsset({
      taskId: nextTask.id,
      marketItemId: nextTask.marketItemId,
      category: nextTask.marketCategory ?? "server",
      item: nextTask.item,
      fileName: nextTask.fileName,
      message: t("market.task.running"),
    })
      .then((path) => {
        setDownloadTasks((prev) =>
          prev.map((task) =>
            task.id === nextTask.id
              ? {
                  ...task,
                  status: "completed",
                  progress: 100,
                  speedText: "0 B/s",
                  message: t("market.task.completed"),
                  logs: [
                    ...task.logs,
                    `[${new Date().toLocaleTimeString()}] ${t("market.task.logCompleted", { item: task.item })}`,
                    `[${new Date().toLocaleTimeString()}] ${path}`,
                  ].slice(-80),
                  updatedAt: Date.now(),
                }
              : task,
          ),
        );
      })
      .catch((error) => {
        const parsed = parseInvokeError(error);
        const detail = mapMarketDownloadError(parsed.code, parsed.message, t);
        setDownloadTasks((prev) =>
          prev.map((task) =>
            task.id === nextTask.id
              ? {
                  ...task,
                  status: "failed",
                  speedText: "0 B/s",
                  message: detail,
                  logs: [
                    ...task.logs,
                    `[${new Date().toLocaleTimeString()}] ${t("market.task.logFailed", { item: task.item })}`,
                    `[${new Date().toLocaleTimeString()}] ${detail}`,
                  ].slice(-80),
                  updatedAt: Date.now(),
                }
              : task,
          ),
        );
      });
  }, [downloadTasks, t]);

  return (
    <div className="app-shell">
      <main className="content">
        <LauncherTopBar
          activeView={activeView}
          onActiveViewChange={changeActiveView}
          appearanceMode={appSettings.personalization.appearanceMode}
          onToggleAppearance={toggleAppearanceMode}
          language={appSettings.about.language}
          onToggleLanguage={toggleLanguage}
          onOpenDownloads={() => changeActiveView("downloads")}
          onOpenInbox={openInbox}
          inboxUnreadCount={inboxUnreadCount}
          inboxOpen={inboxOpen}
        />

        <div className="view-frame">
          {platform !== "windows" && viewTransition && (
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

        <CrashAnalysisModal
          open={Boolean(activeCrash)}
          payload={activeCrash}
          onClose={() => setActiveCrash(null)}
        />

        <InboxModal
          open={inboxOpen}
          items={inboxItems}
          onlyUnread={inboxOnlyUnread}
          onToggleOnlyUnread={() => setInboxOnlyUnread((v) => !v)}
          onClose={() => setInboxOpen(false)}
          onClear={() => setInboxItems([])}
          onExport={exportInbox}
        />
      </main>
    </div>
  );
}

export default App;
