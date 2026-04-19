import { useEffect, useState } from "react";

export const APP_SETTINGS_STORAGE_KEY = "amethyst-launcher-settings-v1";
export const APP_SETTINGS_EVENT = "amethyst-app-settings-change";

export type BackgroundPreset = "aurora" | "sunset" | "forest" | "midnight" | "ocean" | "dawn" | "ember" | "graphite";
export type AppearanceMode = "dark" | "light";
export type DownloadSource = "official" | "mirror-cn" | "auto";
export type UpdateChannel = "stable" | "beta";
export type AppLanguage = "zh-CN" | "en-US";

export interface HomeWidgetSettings {
  showResourcePanel: boolean;
  showOverviewCards: boolean;
  showInstanceList: boolean;
  showTaskFlow: boolean;
}

export interface LaunchSettings {
  javaArgs: string;
  minMemoryMb: number;
  maxMemoryMb: number;
  enableGcTuning: boolean;
}

export interface PersonalizationSettings {
  appearanceMode: AppearanceMode;
  themeColor: string;
  backgroundPreset: BackgroundPreset;
  backgroundImageUrl: string;
  homeWidgets: HomeWidgetSettings;
}

export interface DownloadSettings {
  fileSource: DownloadSource;
  versionSource: DownloadSource;
  maxThreads: number;
  speedLimitMbps: number;
  folders: {
    core: string;
    java: string;
    mods: string;
    backups: string;
  };
}

export interface AboutSettings {
  autoCheckUpdates: boolean;
  updateChannel: UpdateChannel;
  language: AppLanguage;
}

export interface AppSettings {
  launch: LaunchSettings;
  personalization: PersonalizationSettings;
  download: DownloadSettings;
  about: AboutSettings;
}

export const defaultAppSettings: AppSettings = {
  launch: {
    javaArgs: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled",
    minMemoryMb: 2048,
    maxMemoryMb: 4096,
    enableGcTuning: true,
  },
  personalization: {
    appearanceMode: "dark",
    themeColor: "#ff9f43",
    backgroundPreset: "aurora",
    backgroundImageUrl: "",
    homeWidgets: {
      showResourcePanel: true,
      showOverviewCards: true,
      showInstanceList: true,
      showTaskFlow: true,
    },
  },
  download: {
    fileSource: "auto",
    versionSource: "official",
    maxThreads: 8,
    speedLimitMbps: 0,
    folders: {
      core: "~/Library/Application Support/Amethyst-Server-Launcher/downloads/core",
      java: "~/Library/Application Support/Amethyst-Server-Launcher/runtime/java",
      mods: "~/Library/Application Support/Amethyst-Server-Launcher/downloads/mods",
      backups: "~/Library/Application Support/Amethyst-Server-Launcher/backups",
    },
  },
  about: {
    autoCheckUpdates: true,
    updateChannel: "stable",
    language: "zh-CN",
  },
};

function coerceObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function mergeSettings(partial: unknown): AppSettings {
  const root = coerceObject(partial);
  const launch = coerceObject(root.launch);
  const personalization = coerceObject(root.personalization);
  const homeWidgets = coerceObject(personalization.homeWidgets);
  const download = coerceObject(root.download);
  const folders = coerceObject(download.folders);
  const about = coerceObject(root.about);

  return {
    launch: {
      javaArgs:
        typeof launch.javaArgs === "string" ? launch.javaArgs : defaultAppSettings.launch.javaArgs,
      minMemoryMb:
        typeof launch.minMemoryMb === "number"
          ? launch.minMemoryMb
          : defaultAppSettings.launch.minMemoryMb,
      maxMemoryMb:
        typeof launch.maxMemoryMb === "number"
          ? launch.maxMemoryMb
          : defaultAppSettings.launch.maxMemoryMb,
      enableGcTuning:
        typeof launch.enableGcTuning === "boolean"
          ? launch.enableGcTuning
          : defaultAppSettings.launch.enableGcTuning,
    },
    personalization: {
      appearanceMode:
        personalization.appearanceMode === "dark" || personalization.appearanceMode === "light"
          ? personalization.appearanceMode
          : defaultAppSettings.personalization.appearanceMode,
      themeColor:
        typeof personalization.themeColor === "string"
          ? personalization.themeColor
          : defaultAppSettings.personalization.themeColor,
      backgroundPreset:
        personalization.backgroundPreset === "aurora" ||
        personalization.backgroundPreset === "sunset" ||
        personalization.backgroundPreset === "forest" ||
        personalization.backgroundPreset === "midnight" ||
        personalization.backgroundPreset === "ocean" ||
        personalization.backgroundPreset === "dawn" ||
        personalization.backgroundPreset === "ember" ||
        personalization.backgroundPreset === "graphite"
          ? personalization.backgroundPreset
          : defaultAppSettings.personalization.backgroundPreset,
      backgroundImageUrl:
        typeof personalization.backgroundImageUrl === "string"
          ? personalization.backgroundImageUrl
          : defaultAppSettings.personalization.backgroundImageUrl,
      homeWidgets: {
        showResourcePanel:
          typeof homeWidgets.showResourcePanel === "boolean"
            ? homeWidgets.showResourcePanel
            : defaultAppSettings.personalization.homeWidgets.showResourcePanel,
        showOverviewCards:
          typeof homeWidgets.showOverviewCards === "boolean"
            ? homeWidgets.showOverviewCards
            : defaultAppSettings.personalization.homeWidgets.showOverviewCards,
        showInstanceList:
          typeof homeWidgets.showInstanceList === "boolean"
            ? homeWidgets.showInstanceList
            : defaultAppSettings.personalization.homeWidgets.showInstanceList,
        showTaskFlow:
          typeof homeWidgets.showTaskFlow === "boolean"
            ? homeWidgets.showTaskFlow
            : defaultAppSettings.personalization.homeWidgets.showTaskFlow,
      },
    },
    download: {
      fileSource:
        download.fileSource === "official" ||
        download.fileSource === "mirror-cn" ||
        download.fileSource === "auto"
          ? download.fileSource
          : defaultAppSettings.download.fileSource,
      versionSource:
        download.versionSource === "official" ||
        download.versionSource === "mirror-cn" ||
        download.versionSource === "auto"
          ? download.versionSource
          : defaultAppSettings.download.versionSource,
      maxThreads:
        typeof download.maxThreads === "number"
          ? download.maxThreads
          : defaultAppSettings.download.maxThreads,
      speedLimitMbps:
        typeof download.speedLimitMbps === "number"
          ? download.speedLimitMbps
          : defaultAppSettings.download.speedLimitMbps,
      folders: {
        core:
          typeof folders.core === "string"
            ? folders.core
            : defaultAppSettings.download.folders.core,
        java:
          typeof folders.java === "string"
            ? folders.java
            : defaultAppSettings.download.folders.java,
        mods:
          typeof folders.mods === "string"
            ? folders.mods
            : defaultAppSettings.download.folders.mods,
        backups:
          typeof folders.backups === "string"
            ? folders.backups
            : defaultAppSettings.download.folders.backups,
      },
    },
    about: {
      autoCheckUpdates:
        typeof about.autoCheckUpdates === "boolean"
          ? about.autoCheckUpdates
          : defaultAppSettings.about.autoCheckUpdates,
      updateChannel:
        about.updateChannel === "stable" || about.updateChannel === "beta"
          ? about.updateChannel
          : defaultAppSettings.about.updateChannel,
      language:
        about.language === "zh-CN" || about.language === "en-US"
          ? about.language
          : defaultAppSettings.about.language,
    },
  };
}

export function loadAppSettings(): AppSettings {
  if (typeof window === "undefined") {
    return defaultAppSettings;
  }

  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultAppSettings;
    }
    return mergeSettings(JSON.parse(raw));
  } catch {
    return defaultAppSettings;
  }
}

export function persistAppSettings(next: AppSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<AppSettings>(APP_SETTINGS_EVENT, { detail: next }));
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== APP_SETTINGS_STORAGE_KEY) {
        return;
      }
      setSettings(loadAppSettings());
    };

    const handleCustom = (event: Event) => {
      const custom = event as CustomEvent<AppSettings>;
      if (custom.detail) {
        setSettings(custom.detail);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(APP_SETTINGS_EVENT, handleCustom as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(APP_SETTINGS_EVENT, handleCustom as EventListener);
    };
  }, []);

  const update = (updater: AppSettings | ((previous: AppSettings) => AppSettings)) => {
    setSettings((previous) => {
      const next = typeof updater === "function" ? (updater as (input: AppSettings) => AppSettings)(previous) : updater;
      persistAppSettings(next);
      return next;
    });
  };

  return [settings, update] as const;
}
