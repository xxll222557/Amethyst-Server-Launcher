export type Locale = "zh-CN" | "en-US";

export const defaultLocale: Locale = "zh-CN";

export const translations = {
  "zh-CN": {
    launcherName: "Minecraft 启动器",
    home: "主界面",
    instances: "实例列表",
    settings: "设置",
  },
  "en-US": {
    launcherName: "Minecraft Launcher",
    home: "Home",
    instances: "Instances",
    settings: "Settings",
  },
} as const;

export function getTranslation(locale: Locale, key: keyof typeof translations["zh-CN"]) {
  return translations[locale][key];
}
