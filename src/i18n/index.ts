import { useAppSettings, type AppLanguage } from "../features/appSettings";
import enUS from "./en-US";
import zhCN from "./zh-CN";

export type Locale = AppLanguage;

export const defaultLocale: Locale = "zh-CN";

const translations = {
  "zh-CN": zhCN,
  "en-US": enUS,
} as const;

export type TranslationKey = keyof typeof zhCN;

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_full, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function t(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>) {
  const table = translations[locale] ?? translations[defaultLocale];
  const fallback = translations[defaultLocale];
  const raw = table[key] ?? fallback[key] ?? key;
  return interpolate(raw, vars);
}

export function useI18n() {
  const [settings, setSettings] = useAppSettings();
  const locale = settings.about.language;

  return {
    locale,
    t: (key: TranslationKey, vars?: Record<string, string | number>) => t(locale, key, vars),
    setLocale: (next: Locale) => {
      setSettings((current) => ({
        ...current,
        about: {
          ...current.about,
          language: next,
        },
      }));
    },
  };
}
